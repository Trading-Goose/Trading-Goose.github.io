import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Settings, 
  LogOut,
  User as UserIcon
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

export default function PageHeader() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, apiSettings } = useAuth();
  const hasApiKeys = hasRequiredApiKeys(apiSettings);

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => navigate('/')}
            >
              <div className="p-2 rounded-lg bg-gradient-primary">
                <TrendingUp className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">TradingGoose</h1>
                <p className="text-sm text-muted-foreground">AI-Powered Portfolio Management</p>
              </div>
            </div>
            {isAuthenticated && (
              <Badge variant="secondary" className="animate-pulse-glow">
                {hasApiKeys ? 'Portfolio Mode' : 'Setup Required'}
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {isAuthenticated && (
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
                    <DropdownMenuItem asChild>
                      <Link to="/alpha-vantage-test" className="flex items-center">
                        <Settings className="h-4 w-4 mr-2" />
                        Alpha Vantage Test
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
            )}
          </div>
        </div>
      </div>
    </header>
  );
}