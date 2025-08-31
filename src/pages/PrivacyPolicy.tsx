import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, Lock, Eye, Database, Key, UserCheck, Globe, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  const lastUpdated = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2">
            Last Updated: {lastUpdated}
          </p>
        </div>

        {/* Key Privacy Commitment */}
        <Alert className="mb-8 border-primary/50 bg-primary/5">
          <Shield className="h-5 w-5 text-primary" />
          <AlertDescription className="text-sm font-medium">
            <strong>Our Privacy Commitment:</strong> TradingGoose stores your API credentials securely using Supabase's
            encrypted database infrastructure. All credentials are encrypted at rest and in transit, protected by
            enterprise-grade security measures, and accessible only through authenticated API calls with Row Level Security.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          {/* Section 1 - Credentials and API Keys */}
          <Card className="border-primary/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Key className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold mb-4">1. API Credentials and Trading Account Access</h2>
                  <div className="space-y-3 text-muted-foreground leading-relaxed">
                    <p>
                      <strong className="text-foreground">How TradingGoose handles your credentials:</strong>
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>AI provider API keys (OpenAI, Anthropic, Google, etc.) are encrypted and stored in Supabase</li>
                      <li>Alpaca trading credentials are encrypted and stored securely in Supabase</li>
                      <li>All credentials are encrypted using industry-standard algorithms</li>
                      <li>Row Level Security (RLS) ensures users can only access their own credentials</li>
                      <li>Credentials are used only for authorized API calls on your behalf</li>
                      <li>We do not log or monitor individual trading activities</li>
                    </ul>
                    <p className="mt-4">
                      <strong className="text-foreground">Security measures in place:</strong>
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Supabase provides SOC 2 Type II compliance and enterprise-grade security</li>
                      <li>All data is encrypted at rest and in transit using SSL/TLS</li>
                      <li>Multi-factor authentication available for account access</li>
                      <li>Regular security audits and vulnerability assessments</li>
                      <li>Automatic backups and data redundancy</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2 - Information We Collect */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Database className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
                  <div className="space-y-3 text-muted-foreground leading-relaxed">
                    <p>TradingGoose collects only minimal, non-sensitive information necessary for platform operation:</p>

                    <p className="font-medium text-foreground">Account Information:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Email address (for authentication and communication)</li>
                      <li>Username or display name (optional)</li>
                      <li>Account preferences and settings (theme, notification preferences)</li>
                    </ul>

                    <p className="font-medium text-foreground mt-3">Usage Information:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Features accessed and workflow configurations (without sensitive data)</li>
                      <li>Analysis parameters and stock symbols searched (public information only)</li>
                      <li>Timestamps of platform usage</li>
                      <li>Error logs for debugging (sanitized of any sensitive information)</li>
                    </ul>

                    <p className="font-medium text-foreground mt-3">We explicitly do NOT collect:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Financial account numbers or credentials</li>
                      <li>Social Security numbers or tax identification numbers</li>
                      <li>Credit card or banking information</li>
                      <li>Actual trading positions, balances, or transaction history</li>
                      <li>Personal investment strategies or portfolio details</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3 - How We Use Information */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <UserCheck className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold mb-4">3. How We Use Information</h2>
                  <div className="space-y-3 text-muted-foreground leading-relaxed">
                    <p>The limited information we collect is used solely for:</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Providing and maintaining the TradingGoose platform</li>
                      <li>Authenticating users and managing accounts</li>
                      <li>Saving user preferences and workflow configurations</li>
                      <li>Sending important platform updates or security notices</li>
                      <li>Improving platform features and user experience</li>
                      <li>Troubleshooting technical issues and providing support</li>
                      <li>Complying with legal obligations</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4 - Data Storage and Security */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Lock className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold mb-4">4. Data Storage and Security</h2>
                  <div className="space-y-3 text-muted-foreground leading-relaxed">
                    <p>We implement industry-standard security measures to protect your information:</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>All data transmission is encrypted using SSL/TLS protocols</li>
                      <li>User passwords are hashed using industry-standard algorithms</li>
                      <li>Regular security audits and vulnerability assessments</li>
                      <li>Access to user data is restricted to authorized personnel only</li>
                      <li>Secure cloud infrastructure with data encryption at rest</li>
                    </ul>
                    <p className="mt-4">
                      <strong className="text-foreground">Important:</strong> Your credentials are protected by multiple layers
                      of security including Supabase's enterprise-grade infrastructure, encryption, and Row Level Security.
                      We follow industry best practices to ensure your sensitive information remains secure.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 5 - Data Sharing */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Globe className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold mb-4">5. Information Sharing and Disclosure</h2>
                  <div className="space-y-3 text-muted-foreground leading-relaxed">
                    <p>
                      <strong className="text-foreground">TradingGoose does NOT sell, trade, rent, or share your personal information with third parties.</strong>
                    </p>
                    <p className="mt-4">
                      <strong className="text-foreground">We NEVER share:</strong>
                    </p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li>Your encrypted API credentials</li>
                      <li>Trading account credentials</li>
                      <li>Personal financial information</li>
                      <li>Individual usage patterns or trading strategies</li>
                      <li>Any user data with third parties</li>
                    </ul>
                    <p className="mt-4">
                      Your data remains private and is used solely for providing TradingGoose services to you. We maintain strict data privacy policies and do not disclose user information to any external parties.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 6 - Third-Party Services */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Eye className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-xl font-semibold mb-4">6. Third-Party Services</h2>
                  <div className="space-y-3 text-muted-foreground leading-relaxed">
                    <p>TradingGoose integrates with third-party services in the following ways:</p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>
                        <strong>AI Providers (OpenAI, Anthropic, etc.):</strong> Your encrypted API keys are used to make
                        authorized calls to AI providers on your behalf. Keys are stored securely in Supabase with encryption.
                      </li>
                      <li>
                        <strong>Alpaca Trading Platform:</strong> Your encrypted Alpaca credentials are used to make authorized
                        API calls for market data and trading operations. All credentials are securely stored in Supabase.
                      </li>
                      <li>
                        <strong>Market Data Providers:</strong> We may use third-party services for public market data,
                        but these do not involve your personal or financial information.
                      </li>
                      <li>
                        <strong>Analytics Services:</strong> We may use privacy-focused analytics to understand platform
                        usage patterns (no personal data is shared).
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 7 - Your Rights */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">7. Your Rights and Choices</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>You have the following rights regarding your information:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access:</strong> Request a copy of the information we have about you</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate information</li>
                  <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                  <li><strong>Portability:</strong> Request your data in a portable format</li>
                  <li><strong>Opt-out:</strong> Opt-out of marketing communications at any time</li>
                  <li><strong>Withdraw Consent:</strong> Withdraw consent for data processing where applicable</li>
                </ul>
                <p className="mt-4">
                  To exercise any of these rights, please contact us through our support channels.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 8 - Cookies */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">8. Cookies and Tracking Technologies</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>We use cookies and similar technologies for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Maintaining your session and authentication state</li>
                  <li>Remembering your preferences and settings</li>
                  <li>Understanding how you use the platform (analytics)</li>
                  <li>Improving platform performance and user experience</li>
                </ul>
                <p className="mt-4">
                  You can control cookies through your browser settings. Note that disabling cookies may affect
                  platform functionality.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Section 9 - Children's Privacy */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">9. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                TradingGoose is not intended for users under the age of 18. We do not knowingly collect personal
                information from children under 18. If we become aware that we have collected information from a
                child under 18, we will take steps to delete such information.
              </p>
            </CardContent>
          </Card>

          {/* Section 10 - International Users */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">10. International Data Transfers</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you access TradingGoose from outside the United States, please note that your information may be
                transferred to, stored, and processed in the United States or other countries. By using the platform,
                you consent to such transfers in accordance with this Privacy Policy.
              </p>
            </CardContent>
          </Card>

          {/* Section 11 - Changes to Privacy Policy */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">11. Changes to This Privacy Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the
                new Privacy Policy on this page and updating the "Last Updated" date. For material changes, we may
                provide additional notice via email or through the platform.
              </p>
            </CardContent>
          </Card>

          {/* Contact Section */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Users className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">Still have questions?</h3>
                  <p className="text-muted-foreground">
                    If you couldn't find the answer you're looking for, please don't hesitate to reach out to our support team.
                    We're here to help you get the most out of TradingGoose.
                  </p>
                  <Button 
                    className="mt-4" 
                    variant="default"
                    onClick={() => window.open('https://discord.gg/3dkTaNyp', '_blank')}
                  >
                    Contact Support
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer Note */}
          <div className="text-center text-sm text-muted-foreground pt-8 pb-4">
            <p className="italic">
              <strong className="text-primary">TradingGoose</strong> - Your privacy and security are our top priorities.
              We never access your trading accounts or API credentials.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;