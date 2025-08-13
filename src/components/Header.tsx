import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Settings,
  LogIn,
  LogOut,
  User as UserIcon,
  FileText,
  Home,
  RefreshCw,
  UserPlus
} from "lucide-react";
import { useAuth, hasRequiredApiKeys } from "@/lib/auth-supabase";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Header() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, apiSettings } = useAuth();
  
  const hasApiKeys = hasRequiredApiKeys(apiSettings);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 rounded-lg bg-gradient-primary">
                  <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-foreground">TradingGoose</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">AI-Powered Portfolio Management</p>
                </div>
              </div>
              
              {isAuthenticated && (
                <div className="hidden md:flex items-center gap-1">
                  <Link to="/dashboard">
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
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              {isAuthenticated ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="max-w-[150px] sm:max-w-none">
                        <UserIcon className="h-4 w-4 mr-2" />
                        <span className="truncate">{user?.name || user?.email}</span>
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
                      <DropdownMenuItem asChild className="md:hidden">
                        <Link to="/dashboard" className="flex items-center">
                          <Home className="h-4 w-4 mr-2" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="md:hidden">
                        <Link to="/analysis-records" className="flex items-center">
                          <FileText className="h-4 w-4 mr-2" />
                          Analysis Records
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild className="md:hidden">
                        <Link to="/rebalance-records" className="flex items-center">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Rebalance Records
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={logout} className="text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <div className="text-right hidden sm:block">
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
                  <Button variant="outline" size="sm" onClick={() => navigate('/login')}>
                    <LogIn className="h-4 w-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Login</span>
                  </Button>
                  <Button variant="default" size="sm" onClick={() => navigate('/register')}>
                    <UserPlus className="h-4 w-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Sign Up</span>
                  </Button>
                  
                  <div className="text-right hidden sm:block">
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
    </>
  );
}