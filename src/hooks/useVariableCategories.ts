/**
 * The category catalog, for any page that draws a group heading or a chip.
 *
 * Three pages need it — the variables grid, the variable page and the admin
 * console — and each of them already had its own effect for fetching the
 * variable catalog. This is the same fetch, deduplicated by the session cache
 * in `services/variables.ts`, so a navigation between them costs nothing.
 *
 * ── It never returns null ────────────────────────────────────────────────
 *
 * `NO_CATEGORIES` is the value before the fetch resolves and after it fails.
 * That is deliberate: a caller that had to handle "not loaded yet" separately
 * would have to decide what to draw in the meantime, and the honest answer —
 * group by the id, label it from the id — is what `NO_CATEGORIES` already
 * does. Nothing blocks on this and nothing disappears while it is in flight.
 */

import { useEffect, useState } from 'react';

import { NO_CATEGORIES, type CategoryCatalog } from '@/domain/categories';
import { fetchVariableCategories } from '@/services/variables';

export function useVariableCategories(): CategoryCatalog {
  const [categories, setCategories] = useState<CategoryCatalog>(NO_CATEGORIES);

  useEffect(() => {
    let live = true;

    fetchVariableCategories()
      .then((loaded) => {
        if (live) setCategories(loaded);
      })
      .catch(() => {
        // Swallowed, like the variable-catalog fetch beside it. The grid
        // still renders every card; the headings are ids rather than panel
        // names, which is a degradation the reader can live with, and an
        // error banner over their own results is not.
      });

    return () => {
      live = false;
    };
  }, []);

  return categories;
}
