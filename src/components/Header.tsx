import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
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
  UserPlus,
  Activity,
  Menu,
  Loader2
} from "lucide-react";
import { useAuth, hasRequiredApiKeys } from "@/lib/auth";
import { RoleBadge, RoleGate } from "@/components/RoleBasedAccess";
import { useRBAC } from "@/hooks/useRBAC";
import { supabase } from "@/lib/supabase";
import { 
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus,
  isAnalysisActive,
  isRebalanceActive
} from "@/lib/statusTypes";
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
  const { user, profile, isAuthenticated, logout, apiSettings } = useAuth();
  const { getPrimaryRole, isLoading: isRoleLoading } = useRBAC();
  const [runningAnalyses, setRunningAnalyses] = useState(0);
  const [runningRebalances, setRunningRebalances] = useState(0);

  const hasApiKeys = hasRequiredApiKeys(apiSettings);
  const primaryRole = getPrimaryRole();

  // Check for running analyses and rebalances
  useEffect(() => {
    const checkRunningTasks = async () => {
      if (!user) return;

      try {
        // Check running analyses
        const { data: analysisData } = await supabase
          .from('analysis_history')
          .select('id, analysis_status, is_canceled')
          .eq('user_id', user.id);

        if (analysisData) {
          const runningCount = analysisData.filter(item => {
            const currentStatus = typeof item.analysis_status === 'number' 
              ? convertLegacyAnalysisStatus(item.analysis_status)
              : item.analysis_status;
            
            if (item.is_canceled || currentStatus === ANALYSIS_STATUS.CANCELLED) {
              return false;
            }
            
            return isAnalysisActive(currentStatus);
          }).length;
          setRunningAnalyses(runningCount);
        }

        // Check running rebalances
        const { data: rebalanceData } = await supabase
          .from('rebalance_requests')
          .select('id, status')
          .eq('user_id', user.id);

        if (rebalanceData) {
          const runningCount = rebalanceData.filter(item => 
            isRebalanceActive(item.status)
          ).length;
          setRunningRebalances(runningCount);
        }
      } catch (error) {
        console.error('Error checking running tasks:', error);
      }
    };

    checkRunningTasks();
    const interval = setInterval(checkRunningTasks, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="sticky top-0 z-50">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-2 rounded-lg">
                  <img src="/goose.png" alt="TradingGoose Logo" className="h-5 w-5 sm:h-10 sm:w-10" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold" style={{ color: '#FFCC00' }}>TradingGoose</h1>
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
                  <Link to="/trade-history">
                    <Button variant="ghost" size="sm">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Trade History
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {isAuthenticated ? (
                <>
                  {/* Desktop Profile Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="hidden md:flex">
                      {isRoleLoading ? (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="max-w-[150px] sm:max-w-none"
                          disabled
                        >
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          <span className="truncate">Loading...</span>
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className={`max-w-[150px] sm:max-w-none transition-all duration-200 ${
                            primaryRole?.color 
                              ? `border border-opacity-30 hover:bg-opacity-20` 
                              : 'border border-border hover:bg-accent'
                          }`}
                          style={primaryRole?.color ? {
                            borderColor: `${primaryRole.color}4D`, // 30% opacity
                            backgroundColor: `${primaryRole.color}1A`, // 10% opacity
                            color: primaryRole.color
                          } : {}}
                          onMouseEnter={(e) => {
                            if (primaryRole?.color) {
                              e.currentTarget.style.backgroundColor = `${primaryRole.color}33`; // 20% opacity on hover
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (primaryRole?.color) {
                              e.currentTarget.style.backgroundColor = `${primaryRole.color}1A`; // Back to 10% opacity
                            }
                          }}
                        >
                          {primaryRole?.icon_url ? (
                            <img 
                              src={primaryRole.icon_url} 
                              alt={primaryRole.display_name}
                              className="h-4 w-4 mr-2 object-contain"
                            />
                          ) : (
                            <UserIcon className="h-4 w-4 mr-2" />
                          )}
                          <span className="truncate">{profile?.name || profile?.full_name || user?.email || 'Profile'}</span>
                        </Button>
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="flex items-center justify-between">
                          <div className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-2" />
                            Profile
                          </div>
                          <RoleBadge className="ml-2" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/settings" className="flex items-center">
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <RoleGate permissions={['admin.access']}>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Admin</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/invitations" className="flex items-center">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Invitations
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/users" className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-2" />
                            User Management
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/roles" className="flex items-center">
                            <Settings className="h-4 w-4 mr-2" />
                            Role Management
                          </Link>
                        </DropdownMenuItem>
                      </RoleGate>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={logout} className="text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Mobile Hamburger Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild className="md:hidden">
                      <Button variant="outline" size="icon">
                        <Menu className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Navigation</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/dashboard" className="flex items-center">
                          <Home className="h-4 w-4 mr-2" />
                          Dashboard
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/analysis-records" className="flex items-center">
                          <FileText className="h-4 w-4 mr-2" />
                          Analysis Records
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/rebalance-records" className="flex items-center">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Rebalance Records
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/trade-history" className="flex items-center">
                          <TrendingUp className="h-4 w-4 mr-2" />
                          Trade History
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Account</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link to="/profile" className="flex items-center justify-between">
                          <div className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-2" />
                            Profile
                          </div>
                          <RoleBadge className="ml-2" />
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/settings" className="flex items-center">
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                      <RoleGate permissions={['admin.access']}>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Admin</DropdownMenuLabel>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/invitations" className="flex items-center">
                            <UserPlus className="h-4 w-4 mr-2" />
                            Invitations
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/users" className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-2" />
                            User Management
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/admin/roles" className="flex items-center">
                            <Settings className="h-4 w-4 mr-2" />
                            Role Management
                          </Link>
                        </DropdownMenuItem>
                      </RoleGate>
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
      
      {/* Running tasks banner */}
      {isAuthenticated && (runningAnalyses > 0 || runningRebalances > 0) && (
        <div className="bg-primary/10 border-b border-primary/20 backdrop-blur-sm">
          <div className="container mx-auto px-6 py-2">
            <div className="flex items-center justify-center gap-4 text-sm">
              {runningRebalances > 0 && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin text-primary" />
                  <span className="font-medium">
                    {runningRebalances === 1 ? 'Portfolio Rebalance is Running' : `${runningRebalances} Portfolio Rebalances Running`}
                  </span>
                </div>
              )}
              {runningAnalyses > 0 && (
                <div className="flex items-center gap-2">
                  <Activity className="h-3 w-3 animate-pulse text-primary" />
                  <span className="font-medium">
                    {runningAnalyses} Analysis{runningAnalyses > 1 ? 'es' : ''} Running
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}