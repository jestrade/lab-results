import { Navigate, Route, Routes } from 'react-router-dom';

import { RedirectIfSignedIn, RequireAuth, RequireRole } from '@/auth/guards';
import { AppLayout } from '@/layouts/AppLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AccountSettings } from '@/pages/app/AccountSettings';
import { ComingSoon } from '@/pages/app/ComingSoon';
import { ReportDetails } from '@/pages/app/ReportDetails';
import { Dashboard } from '@/pages/app/Dashboard';
import { NotFound } from '@/pages/app/NotFound';
import { Reports } from '@/pages/app/Reports';
import { Trends } from '@/pages/app/Trends';
import { Upload } from '@/pages/app/Upload';
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
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="upload" element={<Upload />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:reportId" element={<ReportDetails />} />
          <Route path="variables" element={<Variables />} />
          <Route
            path="variables/:variableId"
            element={
              <ComingSoon
                kicker="Tracked over time"
                title="Variable details"
                ticket="KAN-14 / KAN-46"
                icon="flask"
                description="The full history of one test, with its trend chart, explanation and analysis."
              />
            }
          />
          <Route path="trends" element={<Trends />} />
          <Route
            path="profile"
            element={
              <ComingSoon
                kicker="Account"
                title="Profile"
                ticket="KAN-27 / KAN-48"
                icon="user"
                description="Your name, email verification status and notification preferences."
              />
            }
          />
          <Route path="settings" element={<AccountSettings />} />

          <Route element={<RequireRole role="admin" />}>
            <Route
              path="admin"
              element={
                <ComingSoon
                  kicker="Administration"
                  title="Admin overview"
                  ticket="KAN-18 / KAN-49"
                  icon="shield-check"
                  description="System-wide metrics: users, reports, failures and average processing time."
                />
              }
            />
            <Route
              path="admin/users"
              element={
                <ComingSoon
                  kicker="Administration"
                  title="Users"
                  ticket="KAN-19 / KAN-50"
                  icon="users-three"
                  description="Search accounts, review their activity, and disable or re-enable them."
                />
              }
            />
            <Route
              path="admin/jobs"
              element={
                <ComingSoon
                  kicker="Administration"
                  title="Processing jobs"
                  ticket="KAN-20 / KAN-51"
                  icon="queue"
                  description="Live and failed extraction jobs, with durations and retry controls."
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
