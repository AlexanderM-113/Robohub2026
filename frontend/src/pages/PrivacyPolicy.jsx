import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/login">
          <Button variant="ghost" className="mb-6 gap-2 -ml-3">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>

        <h1 className="font-heading text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: July 2025</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Who We Are</h2>
            <p>
              Robotics Hub is a private team-management application operated by FRC Team 4146 (Sabercats).
              It is designed for use by student team members, mentors, and the team owner for coordinating
              robotics team activities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Information We Collect</h2>
            <p>We collect only the information necessary to operate the team workspace:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account information:</strong> name, email address, and password (stored as a secure hash)</li>
              <li><strong>Optional contact info:</strong> phone number and carrier (only if you choose to enable SMS notifications)</li>
              <li><strong>Messages:</strong> text messages you send in team channels and direct messages</li>
              <li><strong>Files:</strong> documents and images you upload to the team workspace</li>
              <li><strong>Push notification subscriptions:</strong> browser push endpoints for delivering notifications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. How We Use Your Information</h2>
            <p>Your information is used exclusively to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide access to the team workspace and authenticate your identity</li>
              <li>Deliver messages and notifications to team members</li>
              <li>Store and share files within the team</li>
              <li>Send optional email digests and SMS notifications (only if you opt in)</li>
            </ul>
            <p className="font-semibold mt-3">
              We do not sell, share, or provide your data to any third party. All data stays within the
              application backend and is used solely for team operations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Data Storage and Security</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Data is stored in a secure MongoDB database with access restricted to the application</li>
              <li>Passwords are hashed using bcrypt and are never stored in plaintext</li>
              <li>All connections use HTTPS/TLS encryption in transit</li>
              <li>Sensitive fields (messages, phone numbers) may be encrypted at rest using AES encryption</li>
              <li>The application does not use cookies for tracking; authentication cookies are HTTP-only and used solely for session management</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Children's Privacy (COPPA Compliance)</h2>
            <p>
              This application may be used by students under the age of 13 as part of a school-sponsored
              robotics team. In accordance with the Children's Online Privacy Protection Act (COPPA):
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Account creation requires approval by the team owner (a school-authorized adult)</li>
              <li>The school or team organization acts as the consenting agent on behalf of parents/guardians for educational use, in accordance with the FTC's COPPA school consent exception</li>
              <li>We collect only the minimum information necessary for team operations</li>
              <li>We do not use personal information for advertising, profiling, or behavioral targeting</li>
              <li>Parents or guardians may request to review, delete, or refuse further collection of their child's information by contacting the team owner</li>
              <li>Users (or their parents/guardians) may delete their account and all associated data at any time through the Settings page</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. CIPA Compliance</h2>
            <p>
              This application is designed to be compatible with school internet filtering and safety policies
              under the Children's Internet Protection Act (CIPA):
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Content is restricted to team-related communications only</li>
              <li>Team owners and mentors can moderate and delete any message or file</li>
              <li>The application does not link to or display external advertising or unfiltered content</li>
              <li>All access requires authentication and team-owner approval</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Your Rights</h2>
            <p>You (or your parent/guardian if you are under 13) have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Access</strong> your personal data through the Settings page</li>
              <li><strong>Correct</strong> your information by updating your profile in Settings</li>
              <li><strong>Delete</strong> your account and all associated data (messages, files, DMs) through the Settings page or by requesting the team owner to do so</li>
              <li><strong>Opt out</strong> of email and SMS notifications at any time in Settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Data Retention</h2>
            <p>
              Data is retained for the duration of your team membership. When your account is deleted
              (either by you or the team owner), all associated data including messages, direct messages,
              files, and notification subscriptions are permanently removed from our systems.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Contact</h2>
            <p>
              For questions about this privacy policy or to exercise your data rights, contact the
              team owner through the Robotics Hub application or your school's robotics program coordinator.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
