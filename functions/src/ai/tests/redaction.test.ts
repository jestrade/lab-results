import { describe, expect, it } from 'vitest';

import { redact, redactionTotal } from '../redaction';

/**
 * These tests guard a promise the product makes on its landing page and in its
 * registration consent. They matter more than usual because the Gemini free
 * tier's terms allow submitted content to be used for training — whatever
 * leaks here does not come back.
 */
describe('redact', () => {
  it('removes email addresses', () => {
    const { text, counts } = redact('Patient contact: m.okonkwo@example.com');
    expect(text).toBe('Patient contact: [EMAIL]');
    expect(counts.email).toBe(1);
  });

  it('removes phone numbers in several formats', () => {
    for (const phone of ['+44 20 7946 0958', '(555) 123-4567', '555-123-4567']) {
      expect(redact(`Tel ${phone}`).text, phone).not.toContain('123');
      expect(redact(`Tel ${phone}`).text, phone).toContain('[PHONE]');
    }
  });

  it('removes record numbers and other long digit runs', () => {
    const { text } = redact('MRN 4821990321 / NHS 943 476 5919');
    expect(text).not.toMatch(/4821990321/);
    expect(text).not.toMatch(/943 476 5919/);
  });

  it('removes dates, which pin down a date of birth', () => {
    expect(redact('DOB 12/03/1974').text).toBe('DOB [DATE]');
    expect(redact('Collected 2026-03-14').text).toBe('Collected [DATE]');
  });

  it('removes URLs before their digits are partly rewritten', () => {
    // Ordering regression: if the numeric rules ran first, the digits inside a
    // URL would be replaced and the remaining fragment would survive.
    const { text } = redact('Portal https://labs.example.com/patients/99182734');
    expect(text).toBe('Portal [URL]');
    expect(text).not.toContain('99182734');
  });

  it('leaves laboratory values alone', () => {
    // The whole point of sending the text is that the model can read the
    // results. Over-redacting silently destroys the payload.
    const preserved = 'Hemoglobin 14.2 g/dL (13.0-17.0), Potassium 6.3 mmol/L';
    expect(redact(preserved).text).toBe(preserved);
  });

  it('preserves INTEGER reference ranges, which look exactly like identifiers', () => {
    // The case that shaped the design. `130-170` is punctuated identically to
    // a short ID and has no decimal point to mark it as a measurement. It is
    // kept by the digit-count floor on the identifier rules, not by masking.
    for (const range of ['70-100', '130-170', '3-11', '0-5']) {
      expect(redact(`Reference ${range}`).text, range).toBe(`Reference ${range}`);
    }
  });

  it('still removes an identifier just above the range length', () => {
    // The floor has to bite on the other side too, or it is not a boundary.
    expect(redact('ID 1234567').text).toBe('ID [ID]');
  });

  it('preserves decimal reference ranges written with mixed punctuation', () => {
    // The original bug: `.` inside the numbers and `-` between them read as a
    // date and destroyed the range.
    expect(redact('(13.0-17.0)').text).toBe('(13.0-17.0)');
    expect(redact('3.5 - 5.1 mmol/L').text).toBe('3.5 - 5.1 mmol/L');
  });

  it('leaves clinical prose intact', () => {
    const preserved = 'Sample haemolysed. Repeat testing advised by the laboratory.';
    expect(redact(preserved).text).toBe(preserved);
  });

  it('uses typed placeholders rather than deleting', () => {
    // A blank where a field was invites the model to "repair" the document.
    // Keeping a marker tells it a value existed and was withheld.
    const { text } = redact('Patient: a@b.co');
    expect(text).toContain('[EMAIL]');
    expect(text).not.toMatch(/Patient:\s*$/);
  });

  it('handles a realistic report header end to end', () => {
    const { text, counts } = redact(
      [
        'ACME Laboratories — Report',
        'Patient: Miriam Okonkwo   DOB: 04/11/1982   MRN: 88123456',
        'Contact: m.okonkwo@example.com  Tel: +44 20 7946 0958',
        'Collected: 2026-03-03',
        '',
        'Hemoglobin        14.2 g/dL     (13.0-17.0)',
        'Potassium          6.3 mmol/L   (3.5-5.1)  HIGH',
      ].join('\n'),
    );

    expect(text).not.toContain('m.okonkwo@example.com');
    expect(text).not.toContain('88123456');
    expect(text).not.toContain('04/11/1982');
    expect(text).not.toContain('7946');

    // The clinically meaningful content must survive.
    expect(text).toContain('Hemoglobin');
    expect(text).toContain('14.2 g/dL');
    expect(text).toContain('(13.0-17.0)');
    expect(text).toContain('6.3 mmol/L');
    expect(text).toContain('HIGH');

    expect(redactionTotal(counts)).toBeGreaterThanOrEqual(4);
  });

  it('does NOT remove personal names, which is a documented limitation', () => {
    // Asserted rather than wished away. Regexes cannot tell a name from a
    // laboratory or a city, and pretending otherwise would let someone
    // describe this as anonymisation. Names need NER at extraction time
    // (KAN-6); see the header comment in redaction.ts and docs/ai.md.
    const { text } = redact('Patient: Miriam Okonkwo');
    expect(text).toContain('Miriam Okonkwo');
  });

  it('reports counts without echoing what was removed', () => {
    const { counts } = redact('a@b.co and c@d.co');
    expect(counts.email).toBe(2);
    expect(JSON.stringify(counts)).not.toContain('a@b.co');
  });

  it('is safe on empty input', () => {
    expect(redact('').text).toBe('');
    expect(redactionTotal(redact('').counts)).toBe(0);
  });
});
