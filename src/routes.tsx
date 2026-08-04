import { Navigate, Route, Routes } from 'react-router-dom';

import { RedirectIfSignedIn, RequireAuth, RequireRole } from '@/auth/guards';
import { AppLayout } from '@/layouts/AppLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { ComingSoon } from '@/pages/app/ComingSoon';
import { Dashboard } from '@/pages/app/Dashboard';
import { NotFound } from '@/pages/app/NotFound';
import { Reports } from '@/pages/app/Reports';
import { Upload } from '@/pages/app/Upload';
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
          <Route
            path="reports/:reportId"
            element={
              <ComingSoon
                kicker="Report"
                title="Report details"
                ticket="KAN-44"
                icon="file-pdf"
                description="The original PDF beside the results extracted from it."
              />
            }
          />
          <Route
            path="variables"
            element={
              <ComingSoon
                kicker="Tracked over time"
                title="Laboratory variables"
                ticket="KAN-45"
                icon="flask"
                description="Each test you have a result for, with its latest value and how it has moved."
              />
            }
          />
          <Route
            path="trends"
            element={
              <ComingSoon
                kicker="Compare variables"
                title="Trend analysis"
                ticket="KAN-47"
                icon="chart-line"
                description="Chart several variables together over a date range you choose."
              />
            }
          />
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
          <Route
            path="settings"
            element={
              <ComingSoon
                kicker="Account"
                title="Account settings"
                ticket="KAN-27 / KAN-48"
                icon="gear"
                description="Change your password, export your data, or delete your account."
              />
            }
          />

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
