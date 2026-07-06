import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/login">
          <Button variant="ghost" className="mb-6 gap-2 -ml-3">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>

        <h1 className="font-heading text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: July 2025</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Robotics Hub ("the App"), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, do not use the App. If you are under 18, your parent,
              guardian, or school must consent to these terms on your behalf.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Eligibility</h2>
            <p>
              The App is intended for use by members, mentors, and the owner of FRC Team 4146 (Sabercats).
              Access is granted only after approval by the team owner. Users under 13 may only use the App
              with verifiable parental or school consent in compliance with COPPA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Acceptable Use</h2>
            <p>You agree NOT to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Post or share content containing profanity, swear words, slurs, or hate speech</li>
              <li>Post or share sexually explicit, suggestive, or innuendo-laden content</li>
              <li>Upload images, videos, or files that are pornographic, violent, or otherwise inappropriate for minors (18+ content)</li>
              <li>Harass, bully, or threaten other team members</li>
              <li>Attempt to bypass the content filtering system</li>
              <li>Share personal information of other members without their consent</li>
              <li>Use the App for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to other users' accounts or data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Content Moderation</h2>
            <p>
              The App employs automated content filtering that blocks messages containing profanity,
              sexual innuendos, slurs, and other inappropriate language. File uploads with inappropriate
              names or content are also rejected. This filtering is applied to:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>All channel messages</li>
              <li>All direct messages</li>
              <li>File names and uploads</li>
              <li>Task/to-do titles and descriptions</li>
            </ul>
            <p className="mt-3">
              The team owner reserves the right to delete any content and remove any user who violates
              these terms. Repeated violations may result in permanent removal from the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Permissions and Roles</h2>
            <p>
              The App uses a role-based system (owner, mentor, member). Only the team owner can change
              any member's role or permissions. Mentors have elevated moderation privileges (deleting
              messages) but cannot change roles. Members have standard access to team channels and features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. User Content</h2>
            <p>
              You retain ownership of content you post. However, by posting content to the App, you grant
              the team owner a non-exclusive right to store and display that content within the App for
              team coordination purposes. All content is subject to the moderation policies above.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Account Termination</h2>
            <p>
              The team owner may suspend or terminate any account at any time for violations of these
              terms. Upon termination, your data will be deleted in accordance with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Disclaimers</h2>
            <p>
              The App is provided "as is" without warranties of any kind. We do not guarantee uninterrupted
              access or that the content filter will catch all inappropriate content. Users should report
              any inappropriate content they encounter to the team owner.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Changes to Terms</h2>
            <p>
              We may update these terms at any time. Continued use of the App after changes constitutes
              acceptance of the new terms. Significant changes will be announced through the App.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Contact</h2>
            <p>
              For questions about these terms or to report violations, contact the team owner through the App.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
