import { Navigate, Route, Routes } from 'react-router-dom';

import { RedirectIfSignedIn, RequireAuth, RequireRole } from '@/auth/guards';
import { AppLayout } from '@/layouts/AppLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AccountSettings } from '@/pages/app/AccountSettings';
import { ComingSoon } from '@/pages/app/ComingSoon';
import { ReportDetails } from '@/pages/app/ReportDetails';
import { NotFound } from '@/pages/app/NotFound';
import { Profile } from '@/pages/app/Profile';
import { Reports } from '@/pages/app/Reports';
import { Upload } from '@/pages/app/Upload';
import { VariableDetails } from '@/pages/app/VariableDetails';
import { Variables } from '@/pages/app/Variables';
import { LegalPage } from '@/pages/legal/LegalPage';
import { ForgotPassword } from '@/pages/public/ForgotPassword';
import { Landing } from '@/pages/public/Landing';
import { Register } from '@/pages/public/Register';
import { SignIn } from '@/pages/public/SignIn';
import { VerifyEmail } from '@/pages/public/VerifyEmail';

/**
 * Route table (KAN-25, KAN-26, KAN-2).
 *
 * Three tiers, expressed by nesting rather than by checks inside pages:
 *
 *   public          — landing and legal, reachable by anyone
 *   signed-out only — the auth screens, which bounce an authenticated user on
 *   authenticated   — the app shell; `/admin` adds a role check on top
 *
 * `/verify-email` sits inside `RequireAuth` but outside the shell: the user is
 * signed in, but the sidebar would offer them a lot they cannot use yet.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="legal" element={<Navigate to="/legal/medical-disclaimer" replace />} />
        <Route path="legal/:slug" element={<LegalPage />} />
      </Route>

      <Route element={<RedirectIfSignedIn />}>
        <Route path="sign-in" element={<SignIn />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="verify-email" element={<VerifyEmail />} />

        <Route element={<AppLayout />}>
          {/* Laboratory variables is the app's home: it is the page that
              answers "where are my numbers now", which is what a signed-in
              user came for. The dashboard that used to sit here had nothing
              of its own to show — it was a heading and a link to /upload —
              so it has been removed rather than kept as a stop on the way.

              The path stays as a redirect. Bookmarks, the browser's history
              and any link already sent to a user all point at /dashboard, and
              answering those with "page not found" would be a worse outcome
              than one extra hop. */}
          <Route path="dashboard" element={<Navigate to="/variables" replace />} />
          <Route path="upload" element={<Upload />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:reportId" element={<ReportDetails />} />
          <Route path="variables" element={<Variables />} />
          <Route path="variables/:variableId" element={<VariableDetails />} />
          {/* Trend analysis lived here. Every chart on it is now on the
              variable's own page, which shows the same history against the
              same reference band and adds what that page could not: each
              point's own range, the report it came from, and a zoom. Keeping
              a second screen that drew less of the same data was keeping a
              worse copy. The path redirects for the same reason /dashboard
              does — the links are already out there. */}
          <Route path="trends" element={<Navigate to="/variables" replace />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<AccountSettings />} />

          <Route element={<RequireRole role="admin" />}>
            <Route
              path="admin"
              element={
                <ComingSoon
                  kickerKey="nav.administration"
                  titleKey="nav.adminOverview"
                  ticket="KAN-18 / KAN-49"
                  icon="shield-check"
                  descriptionKey="comingSoon.adminOverviewBody"
                />
              }
            />
            <Route
              path="admin/users"
              element={
                <ComingSoon
                  kickerKey="nav.administration"
                  titleKey="nav.adminUsers"
                  ticket="KAN-19 / KAN-50"
                  icon="users-three"
                  descriptionKey="comingSoon.adminUsersBody"
                />
              }
            />
            <Route
              path="admin/jobs"
              element={
                <ComingSoon
                  kickerKey="nav.administration"
                  titleKey="nav.adminJobs"
                  ticket="KAN-20 / KAN-51"
                  icon="queue"
                  descriptionKey="comingSoon.adminJobsBody"
                />
              }
            />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
