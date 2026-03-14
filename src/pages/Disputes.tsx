import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, MessageSquare } from "lucide-react";

export default function Disputes() {
  const { user, isAdmin, isHR } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingDispute, setReviewingDispute] = useState<any>(null);
  const [hrNotes, setHrNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");

  // Fetch disputes
  const { data: disputes } = useQuery({
    queryKey: ["disputes", user?.id, isHR, isAdmin],
    queryFn: async () => {
      const { data } = await supabase
        .from("disputes")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  // Fetch user's attendance logs for filing
  const { data: attendanceLogs } = useQuery({
    queryKey: ["user-attendance-for-dispute", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance_logs")
        .select("*")
        .eq("user_id", user!.id)
        .order("check_in_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
    enabled: !!user,
  });

  const handleSubmitDispute = async () => {
    if (!selectedLogId || !reason.trim()) {
      toast({ title: "Error", description: "Please select an attendance record and provide a reason.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("disputes").insert({
      user_id: user!.id,
      attendance_log_id: selectedLogId,
      reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dispute filed", description: "Your dispute has been submitted for review." });
      setDialogOpen(false);
      setSelectedLogId("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      queryClient.invalidateQueries({ queryKey: ["pending-disputes"] });
    }
  };

  const handleReview = async () => {
    if (!reviewingDispute) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("disputes")
      .update({
        status: reviewAction,
        hr_notes: hrNotes.trim() || null,
        resolved_by: user!.id,
      })
      .eq("id", reviewingDispute.id);
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Dispute ${reviewAction}` });
      setReviewDialogOpen(false);
      setReviewingDispute(null);
      setHrNotes("");
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      queryClient.invalidateQueries({ queryKey: ["pending-disputes"] });
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "approved": return "bg-success/10 text-success border-success/20";
      case "rejected": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display">Disputes</h1>
        {!isAdmin && !isHR && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> File Dispute</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">File a Dispute</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Attendance Record</Label>
                  <Select value={selectedLogId} onValueChange={setSelectedLogId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a record" />
                    </SelectTrigger>
                    <SelectContent>
                      {attendanceLogs?.map((log) => (
                        <SelectItem key={log.id} value={log.id}>
                          {format(new Date(log.check_in_at), "MMM d, yyyy hh:mm a")} — {log.status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why you're disputing this record..." rows={4} />
                </div>
                <Button onClick={handleSubmitDispute} disabled={submitting} className="w-full">
                  {submitting ? "Submitting..." : "Submit Dispute"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">
            {isAdmin || isHR ? "All Disputes" : "My Disputes"}
          </CardTitle>
          <CardDescription>
            {isAdmin || isHR ? "Review and manage staff disputes" : "Track your dispute submissions"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {disputes && disputes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Filed</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>HR Notes</TableHead>
                  {(isAdmin || isHR) && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {disputes.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {format(new Date(d.created_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{d.reason}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColor(d.status)}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{d.hr_notes || "—"}</TableCell>
                    {(isAdmin || isHR) && (
                      <TableCell>
                        {d.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReviewingDispute(d);
                              setReviewDialogOpen(true);
                            }}
                          >
                            <MessageSquare className="h-3 w-3 mr-1" /> Review
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No disputes found.</p>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Review Dispute</DialogTitle>
          </DialogHeader>
          {reviewingDispute && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Reason</Label>
                <p className="mt-1">{reviewingDispute.reason}</p>
              </div>
              <div className="space-y-2">
                <Label>Decision</Label>
                <Select value={reviewAction} onValueChange={(v) => setReviewAction(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approved">Approve</SelectItem>
                    <SelectItem value="rejected">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} placeholder="Add notes..." rows={3} />
              </div>
              <Button onClick={handleReview} disabled={submitting} className="w-full">
                {submitting ? "Processing..." : `${reviewAction === "approved" ? "Approve" : "Reject"} Dispute`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
