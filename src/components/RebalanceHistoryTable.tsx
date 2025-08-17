import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { 
  RefreshCw, 
  Loader2, 
  Eye, 
  Trash2, 
  XCircle, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  MoreVertical,
  StopCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import RebalanceDetailModal from './RebalanceDetailModal';

interface RebalanceAnalysis {
  id: string;
  ticker: string;
  action: string;
  confidence: number;
  agent_insights: any;
}

interface RebalanceRequest {
  id: string;
  user_id: string;
  status: 'initializing' | 'analyzing' | 'planning' | 'pending_approval' | 'executing' | 'completed' | 'cancelled' | 'failed' | 'pending_trades' | 'portfolio_management_started';
  created_at: string;
  total_stocks: number;
  stocks_analyzed: number;
  rebalance_plan?: any;
  error_message?: string;
  constraints?: any;
  target_allocations?: any;
  portfolio_snapshot?: any;
}

export default function RebalanceHistoryTable() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [runningRebalances, setRunningRebalances] = useState<RebalanceRequest[]>([]);
  const [completedRebalances, setCompletedRebalances] = useState<RebalanceRequest[]>([]);
  const [cancelledRebalances, setCancelledRebalances] = useState<RebalanceRequest[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedRebalanceId, setSelectedRebalanceId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRebalanceRequests();
      // Set up real-time subscription for instant updates
      const subscription = supabase
        .channel('rebalance_updates')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'rebalance_requests',
            filter: `user_id=eq.${user.id}`
          }, 
          (payload) => {
            fetchRebalanceRequests();
          }
        )
        .subscribe();

      // Poll for updates every 3 seconds to catch status changes quickly
      // This ensures failed rebalances are detected promptly
      const interval = setInterval(() => {
        fetchRebalanceRequests();
      }, 3000);

      return () => {
        subscription.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [user, runningRebalances.length]);

  const fetchRebalanceRequests = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('rebalance_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Debug logging
      console.log('Fetched rebalance requests:', data?.map(r => ({ 
        id: r.id, 
        status: r.status, 
        error_message: r.error_message,
        rebalance_plan: r.rebalance_plan ? 'exists' : 'null'
      })));

      // Separate running, completed, and cancelled rebalances
      const running: RebalanceRequest[] = [];
      const completed: RebalanceRequest[] = [];
      const cancelled: RebalanceRequest[] = [];

      for (const item of data || []) {
        // Handle failed status explicitly - show in cancelled/failed section
        if (item.status === 'failed') {
          cancelled.push(item);
        } else if (item.status === 'cancelled') {
          cancelled.push(item);
        } else if ((item.status === 'pending_approval' || item.status === 'pending_trades') && item.rebalance_plan) {
          // If status is pending_approval or pending_trades with a rebalance plan, treat as completed
          completed.push(item);
        } else if (['initializing', 'analyzing', 'planning', 'executing', 'portfolio_management_started'].includes(item.status)) {
          running.push(item);
        } else if (item.status === 'completed' || item.status === 'no_action_needed') {
          completed.push(item);
        } else if (item.status === 'pending_approval' || item.status === 'pending_trades') {
          // If we're here, there's no rebalance plan yet, so it's still running
          running.push(item);
        }
      }

      setRunningRebalances(running);
      setCompletedRebalances(completed);
      setCancelledRebalances(cancelled);
    } catch (error) {
      console.error('Error fetching rebalance requests:', error);
      if (!loading) {
        toast({
          title: 'Error Loading History',
          description: 'Failed to load rebalance history. Please try again.',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRebalanceId) return;

    setDeleting(true);
    try {
      // Delete related analyses first from analysis_history table
      const { error: analysesError } = await supabase
        .from('analysis_history')
        .delete()
        .eq('rebalance_request_id', selectedRebalanceId);

      if (analysesError && analysesError.code !== '23503') {
        // Ignore foreign key constraint errors as cascade delete should handle it
        console.warn('Error deleting related analyses:', analysesError);
      }

      // Then delete the rebalance request
      const { error } = await supabase
        .from('rebalance_requests')
        .delete()
        .eq('id', selectedRebalanceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Rebalance record deleted successfully'
      });

      // Refresh the list
      fetchRebalanceRequests();
    } catch (error) {
      console.error('Error deleting rebalance:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete rebalance record',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setSelectedRebalanceId(null);
    }
  };

  const handleCancel = async () => {
    if (!selectedRebalanceId || !user) return;

    setCancelling(true);
    try {
      // First check if the rebalance exists and belongs to the user
      const { data: checkData, error: checkError } = await supabase
        .from('rebalance_requests')
        .select('id, status')
        .eq('id', selectedRebalanceId)
        .eq('user_id', user.id)
        .single();

      if (checkError || !checkData) {
        throw new Error('Rebalance request not found or already cancelled');
      }

      // Only cancel if it's in a cancellable state
      if (['cancelled', 'completed', 'failed'].includes(checkData.status)) {
        toast({
          title: 'Info',
          description: `Rebalance is already ${checkData.status}`,
          variant: 'default'
        });
        return;
      }

      // Use the RPC function to cancel the rebalance (bypasses RLS issues)
      const { error: cancelError } = await supabase
        .rpc('cancel_rebalance_request', {
          p_request_id: selectedRebalanceId
        });

      if (cancelError) {
        // Fallback to direct update if RPC function doesn't exist yet
        const { error: updateError } = await supabase
          .from('rebalance_requests')
          .update({ 
            status: 'cancelled',
            is_canceled: true  // Set the boolean flag for coordinator to check
          })
          .eq('id', selectedRebalanceId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      }


      toast({
        title: 'Success',
        description: 'Rebalance cancelled successfully'
      });

      // Refresh the list
      await fetchRebalanceRequests();
    } catch (error: any) {
      console.error('Error cancelling rebalance:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel rebalance',
        variant: 'destructive'
      });
    } finally {
      setCancelling(false);
      setCancelDialogOpen(false);
      setSelectedRebalanceId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3" />;
      case 'cancelled':
        return <XCircle className="h-3 w-3" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3" />;
      case 'analyzing':
      case 'initializing':
      case 'planning':
      case 'portfolio_management_started':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'pending_trades':
      case 'pending_approval':
      case 'executing':
        return <Clock className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'cancelled':
      case 'failed':
        return 'destructive';
      case 'analyzing':
      case 'initializing':
      case 'pending_trades':
      case 'planning':
      case 'pending_approval':
      case 'executing':
      case 'portfolio_management_started':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const viewRebalanceDetails = (rebalance: RebalanceRequest) => {
    setSelectedDetailId(rebalance.id);
    setDetailModalOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rebalance History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCount = runningRebalances.length + completedRebalances.length + cancelledRebalances.length;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
              <TabsTrigger value="running">Running ({runningRebalances.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completedRebalances.length})</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled ({cancelledRebalances.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {/* Running Rebalances Section */}
              {runningRebalances.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Currently Running</h3>
                  <div className="space-y-2">
                    {runningRebalances.map((item) => (
                      <div
                        key={item.id}
                        className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => viewRebalanceDetails(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">Portfolio Rebalance</span>
                            <Badge variant={getStatusVariant(item.status)}>
                              <span className="flex items-center gap-1">
                                {getStatusIcon(item.status)}
                                {item.status.replace('_', ' ')}
                              </span>
                            </Badge>
                            {item.total_stocks > 0 && (
                              <span className="text-sm text-muted-foreground">
                                {item.stocks_analyzed}/{item.total_stocks} stocks
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Started {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {(item.status === 'analyzing' || item.status === 'initializing' || item.status === 'planning' || item.status === 'portfolio_management_started') && (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-blue-500 transition-all duration-300"
                                    style={{ 
                                      width: `${item.total_stocks > 0 
                                        ? (item.stocks_analyzed / item.total_stocks) * 100 
                                        : 0}%` 
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {Math.round((item.stocks_analyzed / (item.total_stocks || 1)) * 100)}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="border border-slate-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                viewRebalanceDetails(item);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Details
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 border border-slate-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRebalanceId(item.id);
                                    setCancelDialogOpen(true);
                                  }}
                                  className="text-red-500 hover:text-white hover:bg-red-600"
                                  disabled={cancelling}
                                >
                                  <StopCircle className="h-4 w-4 mr-2" />
                                  Cancel Rebalance
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRebalanceId(item.id);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-red-500 hover:text-white hover:bg-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Rebalances Section */}
              {completedRebalances.length > 0 && (
                <div className="space-y-3">
                  {runningRebalances.length > 0 && (
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Completed Rebalances</h3>
                  )}
                  {completedRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant="default">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Completed
                            </span>
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {item.total_stocks} stocks analyzed
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Completed on: {new Date(item.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 border border-slate-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-500 hover:text-white hover:bg-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Cancelled Rebalances Section */}
              {cancelledRebalances.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Cancelled/Failed</h3>
                  {cancelledRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-75"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant="destructive">
                            <span className="flex items-center gap-1">
                              {item.status === 'failed' ? <AlertCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {item.status === 'failed' ? 'Failed' : 'Cancelled'}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {item.status === 'failed' 
                            ? (item.error_message || item.rebalance_plan?.error || item.rebalance_plan?.errorDetails || 'Rebalance failed') 
                            : (item.error_message || 'Rebalance was cancelled by user')}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 border border-slate-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-500 hover:text-white hover:bg-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalCount === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No rebalance records found</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="running" className="space-y-4">
              {runningRebalances.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No running rebalances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runningRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant={getStatusVariant(item.status)}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(item.status)}
                              {item.status === 'failed' ? 'Failed' : item.status.replace('_', ' ')}
                            </span>
                          </Badge>
                          {item.total_stocks > 0 && (
                            <span className="text-sm text-muted-foreground">
                              {item.stocks_analyzed}/{item.total_stocks} stocks
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Started {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {(item.status === 'analyzing' || item.status === 'initializing' || item.status === 'planning') && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-blue-500 transition-all duration-300"
                                  style={{ 
                                    width: `${item.total_stocks > 0 
                                      ? (item.stocks_analyzed / item.total_stocks) * 100 
                                      : 0}%` 
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round((item.stocks_analyzed / (item.total_stocks || 1)) * 100)}%
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 border border-slate-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setCancelDialogOpen(true);
                                }}
                                className="text-red-500 hover:text-white hover:bg-red-600"
                                disabled={cancelling}
                              >
                                <StopCircle className="h-4 w-4 mr-2" />
                                Cancel Rebalance
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-500 hover:text-white hover:bg-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedRebalances.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No completed rebalances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {completedRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant="default">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Completed
                            </span>
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {item.total_stocks} stocks analyzed
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Completed on: {new Date(item.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 border border-slate-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-500 hover:text-white hover:bg-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="space-y-4">
              {cancelledRebalances.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No cancelled rebalances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cancelledRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-75"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant="destructive">
                            <span className="flex items-center gap-1">
                              {item.status === 'failed' ? <AlertCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {item.status === 'failed' ? 'Failed' : 'Cancelled'}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {item.status === 'failed' 
                            ? (item.error_message || item.rebalance_plan?.error || item.rebalance_plan?.errorDetails || 'Rebalance failed') 
                            : (item.error_message || 'Rebalance was cancelled by user')}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 border border-slate-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-red-500 hover:text-white hover:bg-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rebalance Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rebalance record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedRebalanceId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Rebalance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this rebalance operation? Any pending analyses will be stopped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedRebalanceId(null)}>
              Keep Running
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Rebalance'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Modal */}
      <RebalanceDetailModal
        rebalanceId={selectedDetailId}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedDetailId(undefined);
        }}
      />
    </>
  );
}