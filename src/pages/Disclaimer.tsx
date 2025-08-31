import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const Disclaimer = () => {
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
          <h1 className="text-3xl font-bold">Disclaimer</h1>
          <p className="text-muted-foreground mt-2">
            Last Updated: {lastUpdated}
          </p>
        </div>

        {/* Critical Warning */}
        <Alert className="mb-8 border-destructive/50 bg-destructive/5">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <AlertDescription className="text-sm font-medium">
            <strong>IMPORTANT:</strong> TradingGoose is an informational platform only. 
            It does not provide investment advice, brokerage services, or execute trades. 
            Always consult with qualified financial advisors before making investment decisions.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          {/* Section 1 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">1. Informational Purpose Only</h2>
              <p className="text-muted-foreground leading-relaxed">
                TradingGoose is designed exclusively as an <strong>informational platform</strong> that 
                provides AI-powered analysis workflows for processing market data. The platform offers structured AI 
                analysis workflows to process publicly available information and presents processed data for informational 
                purposes only. TradingGoose does <strong>NOT</strong> provide personalized investment advice, make 
                recommendations to buy, sell, or hold any securities, or offer any form of financial advisory services.
              </p>
            </CardContent>
          </Card>

          {/* Section 2 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">2. No Trading or Brokerage Services</h2>
              <p className="text-muted-foreground leading-relaxed">
                TradingGoose does <strong>NOT</strong> provide direct AI trading services, automated trading execution, 
                brokerage or intermediary services, or any form of trade execution on behalf of users. The platform does 
                <strong>NOT</strong> collect, monitor, or have access to users' actual trading activities or brokerage 
                accounts. All trading connections and executions are performed directly between users and their chosen 
                brokerage platforms. TradingGoose merely provides analytical workflows and information processing tools.
              </p>
            </CardContent>
          </Card>

          {/* Section 3 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">3. Not Financial Advice</h2>
              <p className="text-muted-foreground leading-relaxed">
                Nothing on TradingGoose constitutes financial, investment, legal, tax, or other professional advice. 
                The AI-generated analyses, workflows, and insights provided are <strong>NOT</strong> a substitute for 
                professional financial advice or personal judgment. Users should <strong>ALWAYS</strong> consult with 
                qualified and licensed financial advisors before making any investment decisions.
              </p>
            </CardContent>
          </Card>

          {/* Section 4 */}
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4 text-destructive">4. High-Risk Financial Activity Warning</h2>
              <p className="text-muted-foreground leading-relaxed">
                Trading and investing in financial markets involves <strong>substantial risk of loss</strong> and is not 
                suitable for every investor. The valuation of financial instruments may fluctuate, and as a result, users 
                may lose more than their original investment. Users may lose some or <strong>all</strong> of their invested 
                capital. Past performance, simulations, and analyses do <strong>NOT</strong> guarantee future results. 
                Users should never invest money they cannot afford to lose and must be fully aware of and accept all risks 
                associated with trading and investing before entering any financial markets.
              </p>
            </CardContent>
          </Card>

          {/* Section 5 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">5. AI and Algorithmic Limitations</h2>
              <p className="text-muted-foreground leading-relaxed">
                The AI systems and algorithms used by TradingGoose are based on historical data and mathematical models 
                that may not accurately predict future market conditions. AI-generated insights are subject to limitations, 
                biases, and errors inherent in machine learning systems. Market conditions can change rapidly and 
                unpredictably, rendering any analysis obsolete. Users should independently verify all information and not 
                rely solely on AI-generated content for investment decisions.
              </p>
            </CardContent>
          </Card>

          {/* Section 6 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">6. No Guarantee of Accuracy or Completeness</h2>
              <p className="text-muted-foreground leading-relaxed">
                While TradingGoose strives to provide accurate and timely information, we make <strong>NO</strong> representations 
                or warranties of any kind, express or implied, about the completeness, accuracy, reliability, suitability, or 
                availability of any information, products, services, or related graphics. Any reliance placed on such information 
                is strictly at the user's own risk.
              </p>
            </CardContent>
          </Card>

          {/* Section 7 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">7. User Responsibility</h2>
              <p className="text-muted-foreground leading-relaxed">
                Users are solely responsible for conducting their own research and due diligence before making any investment 
                decisions. Users must consider their personal financial situation, investment objectives, risk tolerance, and 
                investment horizon. Users acknowledge that they are using TradingGoose at their own risk and that all investment 
                decisions and their consequences are solely their responsibility.
              </p>
            </CardContent>
          </Card>

          {/* Section 8 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">8. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                To the fullest extent permitted by law, TradingGoose, its creators, operators, employees, and affiliates 
                shall <strong>NOT</strong> be liable for any direct, indirect, incidental, special, consequential, or punitive 
                damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses resulting 
                from the use or inability to use the platform, any gains or losses incurred in real-world trading, or any 
                investment decisions made based on information provided by the platform.
              </p>
            </CardContent>
          </Card>

          {/* Section 9 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">9. Data Privacy and Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                TradingGoose does <strong>NOT</strong> collect or monitor users' actual trading activities, have access to 
                users' brokerage accounts, or store sensitive financial information beyond what users explicitly provide for 
                analysis purposes. The platform processes only publicly available market data and user-provided parameters 
                for generating analyses through AI workflows.
              </p>
            </CardContent>
          </Card>

          {/* Section 10 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">10. Regulatory Compliance</h2>
              <p className="text-muted-foreground leading-relaxed">
                Users are responsible for ensuring their use of TradingGoose and any resulting investment activities comply 
                with all applicable laws and regulations in their jurisdiction. TradingGoose makes no representation that 
                the platform is appropriate or available for use in all locations. Users accessing the platform from 
                jurisdictions where its contents are illegal or prohibited do so at their own risk.
              </p>
            </CardContent>
          </Card>

          {/* Section 11 */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">11. Modification of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                TradingGoose reserves the right to modify this disclaimer at any time without prior notice. Users are 
                responsible for regularly reviewing this disclaimer. Continued use of the platform after any modifications 
                constitutes acceptance of the updated terms.
              </p>
            </CardContent>
          </Card>

          {/* Section 12 - Legal & Compliance */}
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">12. Legal & Compliance</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <div>
                  <p className="font-semibold text-foreground mb-2">Investment Advisory Registration</p>
                  <p>
                    TradingGoose is <strong>NOT</strong> registered as an investment advisor with the Securities and Exchange 
                    Commission (SEC) or any state securities authority. We are not a Registered Investment Advisor (RIA), 
                    broker-dealer, or financial institution. TradingGoose does not provide personalized investment advice, 
                    portfolio management services, or fiduciary services.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-2">Professional and Commercial Use</p>
                  <p>
                    TradingGoose is designed for individual, non-commercial use only. Professional traders, financial advisors, 
                    fund managers, and institutional users must:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Obtain appropriate licenses and registrations in their jurisdiction</li>
                    <li>Ensure compliance with all professional standards and regulations</li>
                    <li>Verify that AI-assisted analysis meets their compliance requirements</li>
                    <li>Maintain proper documentation for regulatory audits</li>
                    <li>Consider enterprise-grade solutions designed for professional use</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-2">Jurisdictional Restrictions</p>
                  <p>
                    The use of AI-powered trading analysis tools may be restricted or prohibited in certain jurisdictions. 
                    Users are responsible for determining whether their use of TradingGoose is lawful in their location. 
                    Some jurisdictions may require specific licenses, registrations, or prohibit certain trading activities.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-2">Tax Obligations</p>
                  <p>
                    Users are solely responsible for all tax obligations arising from their trading activities. This includes 
                    but is not limited to capital gains taxes, income taxes, and any reporting requirements. TradingGoose does 
                    not provide tax advice or tax reporting services.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-2">Risk Disclosure Requirements</p>
                  <p>
                    <strong>CFTC RULE 4.41 DISCLAIMER:</strong> HYPOTHETICAL OR SIMULATED PERFORMANCE RESULTS HAVE CERTAIN 
                    LIMITATIONS. UNLIKE AN ACTUAL PERFORMANCE RECORD, SIMULATED RESULTS DO NOT REPRESENT ACTUAL TRADING. 
                    ALSO, SINCE THE TRADES HAVE NOT BEEN EXECUTED, THE RESULTS MAY HAVE UNDER-OR-OVER COMPENSATED FOR THE 
                    IMPACT, IF ANY, OF CERTAIN MARKET FACTORS, SUCH AS LACK OF LIQUIDITY. SIMULATED TRADING PROGRAMS IN 
                    GENERAL ARE ALSO SUBJECT TO THE FACT THAT THEY ARE DESIGNED WITH THE BENEFIT OF HINDSIGHT. NO 
                    REPRESENTATION IS BEING MADE THAT ANY ACCOUNT WILL OR IS LIKELY TO ACHIEVE PROFIT OR LOSSES SIMILAR 
                    TO THOSE SHOWN.
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground mb-2">Anti-Money Laundering (AML) and Know Your Customer (KYC)</p>
                  <p>
                    While TradingGoose does not handle user funds or execute trades directly, users must ensure their trading 
                    activities comply with all applicable AML and KYC regulations. Users are responsible for complying with 
                    all financial crime prevention requirements in their jurisdiction.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 13 - Acceptance */}
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">13. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing and using TradingGoose, you acknowledge that you have read, understood, and agree to be bound 
                by this disclaimer. If you do not agree with any part of this disclaimer, you must immediately discontinue 
                use of the platform.
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
              <strong className="text-primary">TradingGoose</strong> - Providing structured AI analysis workflows for 
              informational purposes only.
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Disclaimer;