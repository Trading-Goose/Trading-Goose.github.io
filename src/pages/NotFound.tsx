import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Home,
  ArrowLeft
} from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-6 py-16">
        <div className="max-w-5xl mx-auto">
          <Card className="border-0   bg-transparent">
            <CardContent className="p-8 md:p-12 ">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                {/* Left side - Image */}
                <div className="flex justify-center md:justify-end">
                  <img
                    src="/goose_stare.png"
                    alt="Lost Goose"
                    className="w-48 h-48 md:w-64 md:h-64 opacity-90"
                  />
                </div>

                {/* Right side - Content */}
                <div className="text-center md:text-left">
                  <h1 className="text-7xl md:text-8xl font-bold text-primary mb-4">404</h1>
                  <h2 className="text-2xl font-semibold mb-3">HONK! Page Not Found</h2>
                  <p className="text-muted-foreground text-lg mb-6">
                    Sorry, the page you're looking for doesn't exist or has been moved.
                  </p>

                  {/* Current Path Display */}
                  <div className="bg-muted/50 rounded-lg p-3 mb-8 overflow-x-auto">
                    <code className="text-sm text-muted-foreground break-all">
                      {window.location.href}
                    </code>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                    <Button
                      onClick={() => navigate(-1)}
                      variant="outline"
                      size="lg"
                      className="min-w-[140px]"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Go Back
                    </Button>

                    <Button
                      onClick={() => navigate("/")}
                      size="lg"
                      className="min-w-[140px]"
                    >
                      <Home className="mr-2 h-4 w-4" />
                      Return Home
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Help Text */}
          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              Need help? Join our{" "}
              <a
                href="https://discord.gg/wavf5JWhuT"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Discord community
              </a>
              {" "}or check out the{" "}
              <button
                onClick={() => navigate("/faq")}
                className="text-primary hover:underline"
              >
                FAQ
              </button>
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFound;
