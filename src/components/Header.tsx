import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Settings,
  LogIn,
  LogOut,
  User as UserIcon,
  FileText,
  Home,
  RefreshCw
} from "lucide-react";
import { useAuth, hasRequiredApiKeys } from "@/lib/auth-supabase";
import LoginModal from "./LoginModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const { user, isAuthenticated, logout, apiSettings } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  const hasApiKeys = hasRequiredApiKeys(apiSettings);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-primary">
                  <TrendingUp className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">TradingGoose</h1>
                  <p className="text-sm text-muted-foreground">AI-Powered Portfolio Management</p>
                </div>
              </div>
              
              {isAuthenticated && (
                <>
                  <Link to="/">
                    <Button variant="ghost" size="sm">
                      <Home className="h-4 w-4 mr-2" />
                      Dashboard
                    </Button>
                  </Link>
                  <Link to="/analysis-records">
                    <Button variant="ghost" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      Analysis Records
                    </Button>
                  </Link>
                  <Link to="/rebalance-records">
                    <Button variant="ghost" size="sm">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Rebalance Records
                    </Button>
                  </Link>
                </>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {isAuthenticated ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <UserIcon className="h-4 w-4 mr-2" />
                        {user?.name || user?.email}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>My Account</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="flex items-center">
                          <UserIcon className="h-4 w-4 mr-2" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/settings" className="flex items-center">
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={logout} className="text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">System Status</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${hasApiKeys ? 'bg-buy' : 'bg-yellow-500'} animate-pulse`}></div>
                      <span className="text-xs text-muted-foreground">
                        {hasApiKeys ? 'All Agents Ready' : 'API Keys Required'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowLoginModal(true)}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Login
                  </Button>
                  
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">System Status</p>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-500"></div>
                      <span className="text-xs text-muted-foreground">Login Required</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Modals */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />
    </>
  );
}