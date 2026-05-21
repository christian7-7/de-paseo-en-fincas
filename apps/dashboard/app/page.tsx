"use client";

import { useState, useEffect } from "react";
import { motion, Reorder } from "framer-motion";
import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@repo/ui";
import {
  Users,
  MessageSquare,
  Phone,
  Mail,
  Bot,
  UserCheck,
  MapPin,
  Calendar,
  ChevronRight,
  TreePine,
  Bell,
} from "lucide-react";

type LeadStatus = "NEW" | "CONTACTED" | "NEGOTIATING" | "CLOSED_WON" | "CLOSED_LOST";

const COLUMNS: { status: LeadStatus; label: string; color: string }[] = [
  { status: "NEW", label: "Nuevos", color: "border-blue-200 bg-blue-50" },
  { status: "CONTACTED", label: "Contactados", color: "border-yellow-200 bg-yellow-50" },
  { status: "NEGOTIATING", label: "Negociando", color: "border-purple-200 bg-purple-50" },
  { status: "CLOSED_WON", label: "Ganados", color: "border-green-200 bg-green-50" },
  { status: "CLOSED_LOST", label: "Perdidos", color: "border-red-200 bg-red-50" },
];

const STATUS_BADGE: Record<LeadStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  NEW: { variant: "secondary", label: "Nuevo" },
  CONTACTED: { variant: "default", label: "Contactado" },
  NEGOTIATING: { variant: "default", label: "Negociando" },
  CLOSED_WON: { variant: "outline", label: "Ganado" },
  CLOSED_LOST: { variant: "destructive", label: "Perdido" },
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  WHATSAPP: <Phone className="h-3.5 w-3.5 text-green-500" />,
  INSTAGRAM: <Bot className="h-3.5 w-3.5 text-pink-500" />,
  WEB: <Mail className="h-3.5 w-3.5 text-blue-500" />,
  REFERRAL: <Users className="h-3.5 w-3.5 text-purple-500" />,
};

interface Lead {
  id: string;
  clientName: string;
  clientPhone?: string | null;
  clientEmail?: string | null;
  source: string;
  status: LeadStatus;
  municipality?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  adults?: number | null;
  notes?: string | null;
  createdAt: Date;
}

export default function DashboardPage() {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeConversations, setActiveConversations] = useState<{ sessionId: string; clientName: string; lastMessage: string }[]>([]);

  const { data: leadsData, refetch: refetchLeads } = trpc.leads.all.useQuery({
    page: 1,
    pageSize: 100,
  });

  const updateStatusMutation = trpc.leads.updateStatus.useMutation({
    onSuccess: () => refetchLeads(),
  });

  const leads = (leadsData?.items || []) as unknown as Lead[];

  // Group leads by status
  const leadsByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.status] = leads.filter((l) => l.status === col.status);
      return acc;
    },
    {} as Record<LeadStatus, Lead[]>
  );

  // Simulate real-time bot conversations via SSE
  useEffect(() => {
    const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3001";
    const eventSource = new EventSource(`${gatewayUrl}/sse/conversations`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string);
        if (data.type === "NEW_MESSAGE") {
          setActiveConversations((prev) => {
            const existing = prev.find((c) => c.sessionId === data.sessionId);
            if (existing) {
              return prev.map((c) =>
                c.sessionId === data.sessionId
                  ? { ...c, lastMessage: data.message }
                  : c
              );
            }
            return [
              { sessionId: data.sessionId, clientName: data.clientName || "Anónimo", lastMessage: data.message },
              ...prev,
            ].slice(0, 10);
          });
        }
      } catch {
        // ignore
      }
    };

    return () => eventSource.close();
  }, []);

  const handleStatusChange = (leadId: string, newStatus: LeadStatus) => {
    updateStatusMutation.mutate({ id: leadId, status: newStatus });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-[#E8832A]" />
          <span className="font-bold text-sm">Dashboard Asesores</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#E8832A]" />
          </Button>
          <a href="/admin">
            <Button variant="outline" size="sm">Admin</Button>
          </a>
        </div>
      </nav>

      <div className="p-4 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {COLUMNS.slice(0, 4).map((col) => (
            <Card key={col.status}>
              <CardContent className="pt-4 pb-3">
                <div className="text-2xl font-bold">{leadsByStatus[col.status]?.length || 0}</div>
                <div className="text-xs text-muted-foreground">{col.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Kanban */}
          <div className="xl:col-span-2 overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2">
              {COLUMNS.map((col) => (
                <div key={col.status} className={`w-72 shrink-0 rounded-xl border p-3 ${col.color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-sm">{col.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {leadsByStatus[col.status]?.length || 0}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {(leadsByStatus[col.status] || []).map((lead) => (
                      <motion.div
                        key={lead.id}
                        layoutId={lead.id}
                        whileHover={{ scale: 1.01 }}
                        className="bg-white rounded-lg p-3 shadow-sm border border-border cursor-pointer"
                        onClick={() => setSelectedLead(lead)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-sm truncate">{lead.clientName}</span>
                          {SOURCE_ICONS[lead.source]}
                        </div>

                        {lead.municipality && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <MapPin className="h-3 w-3" />
                            {lead.municipality}
                          </div>
                        )}

                        {lead.checkIn && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                            <Calendar className="h-3 w-3" />
                            {new Date(lead.checkIn).toLocaleDateString("es-CO")}
                            {lead.adults && <span>· {lead.adults} personas</span>}
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          {new Date(lead.createdAt).toLocaleDateString("es-CO")}
                        </div>

                        {/* Quick status change */}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {COLUMNS.filter((c) => c.status !== lead.status).slice(0, 2).map((c) => (
                            <button
                              key={c.status}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(lead.id, c.status);
                              }}
                              className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors"
                            >
                              → {c.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    ))}

                    {(leadsByStatus[col.status] || []).length === 0 && (
                      <div className="text-center py-6 text-xs text-muted-foreground">
                        Sin leads en esta columna
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active conversations */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-[#E8832A]" />
                  Conversaciones del bot en tiempo real
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeConversations.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Sin conversaciones activas
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeConversations.map((conv) => (
                      <div
                        key={conv.sessionId}
                        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                      >
                        <div className="h-8 w-8 rounded-full bg-[#E8832A]/20 flex items-center justify-center text-xs font-bold text-[#E8832A] shrink-0">
                          {conv.clientName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{conv.clientName}</div>
                          <div className="text-xs text-muted-foreground truncate">{conv.lastMessage}</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 text-xs h-7"
                          onClick={() => {
                            // Take over conversation
                            console.log("Taking over session:", conv.sessionId);
                          }}
                        >
                          <UserCheck className="h-3 w-3 mr-1" />
                          Tomar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lead detail panel */}
            {selectedLead && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm">{selectedLead.clientName}</CardTitle>
                      <button
                        onClick={() => setSelectedLead(null)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedLead.clientPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-[#E8832A]" />
                        <a href={`tel:${selectedLead.clientPhone}`} className="hover:text-[#E8832A]">
                          {selectedLead.clientPhone}
                        </a>
                      </div>
                    )}
                    {selectedLead.clientEmail && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-[#E8832A]" />
                        <a href={`mailto:${selectedLead.clientEmail}`} className="hover:text-[#E8832A]">
                          {selectedLead.clientEmail}
                        </a>
                      </div>
                    )}
                    {selectedLead.notes && (
                      <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{selectedLead.notes}</div>
                    )}

                    <div className="flex gap-2 pt-2">
                      {selectedLead.clientPhone && (
                        <a
                          href={`https://wa.me/${selectedLead.clientPhone.replace(/\D/g, "")}?text=Hola ${selectedLead.clientName}!`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1"
                        >
                          <Button size="sm" className="w-full gap-1">
                            <Phone className="h-3.5 w-3.5" />
                            WhatsApp
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
