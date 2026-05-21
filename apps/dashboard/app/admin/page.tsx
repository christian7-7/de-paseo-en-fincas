"use client";

import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Badge } from "@repo/ui";
import {
  TreePine, BarChart3, Settings, Bot, Users, DollarSign,
  Calendar, Edit3, Save, AlertCircle, Sliders,
} from "lucide-react";

export default function AdminPage() {
  const { data: metrics } = trpc.admin.metrics.useQuery();
  const { data: botConfigs, refetch: refetchConfigs } = trpc.admin.getBotConfig.useQuery();
  const { data: weights } = trpc.admin.getAssignmentWeights.useQuery();

  const [systemPromptEdit, setSystemPromptEdit] = useState<string | null>(null);
  const [editingWeights, setEditingWeights] = useState(false);
  const [weightsForm, setWeightsForm] = useState<Record<string, number>>({});

  const updateConfig = trpc.admin.updateBotConfig.useMutation({
    onSuccess: () => {
      refetchConfigs();
      setSystemPromptEdit(null);
    },
  });

  const updateWeights = trpc.admin.updateAssignmentWeights.useMutation({
    onSuccess: () => setEditingWeights(false),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configs = botConfigs as any[];
  const systemPromptConfig = configs?.find((c: { key: string }) => c.key === "system_prompt") as
    | { key: string; value: { text?: string } | null }
    | undefined;
  const currentSystemPrompt = systemPromptConfig?.value?.text || "";

  const handleSaveSystemPrompt = () => {
    if (systemPromptEdit === null) return;
    updateConfig.mutate({
      key: "system_prompt",
      value: { text: systemPromptEdit },
    });
  };

  const handleEditWeights = () => {
    if (weights) {
      setWeightsForm({
        municipalityMatchPts: weights.municipalityMatchPts,
        penaltyPerActiveLead: weights.penaltyPerActiveLead,
        scheduleAvailablePts: weights.scheduleAvailablePts,
        conversionRateMultiplier: weights.conversionRateMultiplier,
        responseTimePenaltyPerHour: weights.responseTimePenaltyPerHour,
      });
    }
    setEditingWeights(true);
  };

  const handleSaveWeights = () => {
    updateWeights.mutate({
      municipalityMatchPts: weightsForm.municipalityMatchPts,
      penaltyPerActiveLead: weightsForm.penaltyPerActiveLead,
      scheduleAvailablePts: weightsForm.scheduleAvailablePts,
      conversionRateMultiplier: weightsForm.conversionRateMultiplier,
      responseTimePenaltyPerHour: weightsForm.responseTimePenaltyPerHour,
    });
  };

  const formatCOP = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TreePine className="h-5 w-5 text-[#E8832A]" />
          <span className="font-bold text-sm">Panel Admin</span>
        </div>
        <a href="/">
          <Button variant="outline" size="sm">Dashboard</Button>
        </a>
      </nav>

      <div className="mx-auto max-w-5xl p-6 space-y-8">
        {/* Metrics */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#E8832A]" />
            Métricas globales
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Fincas activas", value: metrics?.activeFincas || 0, icon: TreePine, total: metrics?.totalFincas },
              { label: "Reservas este mes", value: metrics?.reservationsThisMonth || 0, icon: Calendar },
              { label: "Ingresos este mes", value: formatCOP(metrics?.revenueThisMonth || 0), icon: DollarSign },
              { label: "Total leads", value: metrics?.totalLeads || 0, icon: Users },
              { label: "Leads nuevos", value: metrics?.newLeads || 0, icon: AlertCircle },
            ].map(({ label, value, icon: Icon, total }) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Icon className="h-4 w-4 text-[#E8832A]" />
                    <span className="text-xs font-medium">{label}</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {typeof value === "number" ? value.toLocaleString("es-CO") : value}
                  </div>
                  {total !== undefined && (
                    <div className="text-xs text-muted-foreground mt-0.5">de {total} totales</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* System prompt editor */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#E8832A]" />
            System Prompt del bot Paseo
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              {systemPromptEdit === null ? (
                <>
                  <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-4 rounded-lg max-h-60 overflow-y-auto">
                    {currentSystemPrompt}
                  </pre>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => setSystemPromptEdit(currentSystemPrompt)}
                  >
                    <Edit3 className="h-4 w-4" />
                    Editar prompt
                  </Button>
                </>
              ) : (
                <>
                  <textarea
                    value={systemPromptEdit}
                    onChange={(e) => setSystemPromptEdit(e.target.value)}
                    className="w-full min-h-[300px] rounded-lg border border-input p-3 text-sm font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8832A]"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="gap-2"
                      onClick={handleSaveSystemPrompt}
                      loading={updateConfig.isPending}
                    >
                      <Save className="h-4 w-4" />
                      Guardar cambios
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSystemPromptEdit(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {updateConfig.isSuccess && (
                    <p className="text-sm text-green-600">✅ System prompt actualizado</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Assignment weights */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Sliders className="h-5 w-5 text-[#E8832A]" />
            Pesos de asignación de asesores
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              {!editingWeights ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: "municipalityMatchPts", label: "Puntos por municipio coincidente" },
                      { key: "penaltyPerActiveLead", label: "Penalidad por lead activo" },
                      { key: "scheduleAvailablePts", label: "Puntos por estar en línea" },
                      { key: "conversionRateMultiplier", label: "Multiplicador tasa conversión" },
                      { key: "responseTimePenaltyPerHour", label: "Penalidad por hora de respuesta" },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <Badge variant="secondary" className="font-mono">
                          {weights?.[key as keyof typeof weights] ?? "—"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="gap-2" onClick={handleEditWeights}>
                    <Edit3 className="h-4 w-4" />
                    Editar pesos
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: "municipalityMatchPts", label: "Municipio coincidente" },
                      { key: "penaltyPerActiveLead", label: "Penalidad lead activo" },
                      { key: "scheduleAvailablePts", label: "Bonus en línea" },
                      { key: "conversionRateMultiplier", label: "Mult. conversión" },
                      { key: "responseTimePenaltyPerHour", label: "Penalidad respuesta/h" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-xs text-muted-foreground font-medium block mb-1">{label}</label>
                        <Input
                          type="number"
                          step="0.1"
                          value={weightsForm[key] ?? 0}
                          onChange={(e) => setWeightsForm({ ...weightsForm, [key]: parseFloat(e.target.value) })}
                          className="h-9"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button className="gap-2" onClick={handleSaveWeights} loading={updateWeights.isPending}>
                      <Save className="h-4 w-4" />
                      Guardar pesos
                    </Button>
                    <Button variant="outline" onClick={() => setEditingWeights(false)}>Cancelar</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Other configs */}
        <section>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#E8832A]" />
            Otras configuraciones del bot
          </h2>
          <div className="space-y-3">
            {configs
              ?.filter((c: { key: string }) => c.key !== "system_prompt")
              .map((config: { key: string; value: unknown; category?: string; description?: string }) => (
                <Card key={config.key}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm font-semibold">{config.key}</div>
                        {config.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">{config.description}</div>
                        )}
                        <div className="text-xs mt-2 bg-muted p-2 rounded font-mono overflow-x-auto">
                          {JSON.stringify(config.value, null, 2)}
                        </div>
                      </div>
                      <Badge variant="outline">{config.category}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
