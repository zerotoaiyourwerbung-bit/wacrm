"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Trash2,
  GripVertical,
  MessageSquare,
  FileText,
  Tag,
  TagIcon,
  UserCheck,
  PencilLine,
  Briefcase,
  Hourglass,
  GitBranch,
  Webhook,
  CircleSlash,
  Zap,
  Loader2,
  ArrowDown,
  ArrowUp,
  MousePointerClick,
  List,
  Image as ImageIcon,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Phone,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  AccountMember,
  AutomationStepType,
  AutomationTriggerType,
  CustomField,
  InteractiveMessagePayload,
  KeywordMatchTriggerConfig,
  MessageTemplate,
  SendTemplateStepConfig,
  Tag as TagRecord,
  WebhookTriggerConfig,
} from "@/types"
import { extractVariableIndices } from "@/lib/whatsapp/template-validators"
import {
  InteractiveBuilder,
  blankButtonsPayload,
  blankListPayload,
} from "@/components/interactive/interactive-builder"
import { interactivePayloadPreviewText } from "@/lib/whatsapp/interactive"
import { createClient } from "@/lib/supabase/client"
import {
  childPath,
  insertAt,
  mapAtPath,
  moveAt,
  removeAt,
  type ParentScope,
  type StepPath,
} from "@/lib/automations/builder-tree"
import { cn } from "@/lib/utils"

// ------------------------------------------------------------
// Types (builder-local — mirror the flattened rows we POST)
// ------------------------------------------------------------

export interface BuilderStep {
  /** Client id; the API assigns real UUIDs server-side. */
  cid: string
  step_type: AutomationStepType
  step_config: Record<string, unknown>
  branches?: { yes: BuilderStep[]; no: BuilderStep[] }
}

export interface BuilderInitial {
  id?: string
  name: string
  description: string
  trigger_type: AutomationTriggerType
  trigger_config: Record<string, unknown>
  is_active: boolean
  steps: BuilderStep[]
}

// ------------------------------------------------------------
// Step metadata — one source of truth for icon + label + border color
// ------------------------------------------------------------

interface StepMeta {
  label: string
  icon: typeof Zap
  /** Left-border accent color per spec. */
  border: string
}

const STEP_META: Record<AutomationStepType, StepMeta> = {
  send_message: { label: "send_message", icon: MessageSquare, border: "border-l-primary" },
  send_buttons: { label: "send_buttons", icon: MousePointerClick, border: "border-l-primary" },
  send_list: { label: "send_list", icon: List, border: "border-l-primary" },
  send_template: { label: "send_template", icon: FileText, border: "border-l-primary" },
  add_tag: { label: "add_tag", icon: Tag, border: "border-l-primary" },
  remove_tag: { label: "remove_tag", icon: TagIcon, border: "border-l-primary" },
  assign_conversation: { label: "assign_conversation", icon: UserCheck, border: "border-l-primary" },
  update_contact_field: { label: "update_contact_field", icon: PencilLine, border: "border-l-primary" },
  create_deal: { label: "create_deal", icon: Briefcase, border: "border-l-primary" },
  wait: { label: "wait", icon: Hourglass, border: "border-l-border" },
  condition: { label: "condition", icon: GitBranch, border: "border-l-amber-500" },
  send_webhook: { label: "send_webhook", icon: Webhook, border: "border-l-primary" },
  close_conversation: { label: "close_conversation", icon: CircleSlash, border: "border-l-primary" },
}

const ADDABLE_STEPS: AutomationStepType[] = [
  "send_message",
  "send_buttons",
  "send_list",
  "send_template",
  "add_tag",
  "remove_tag",
  "assign_conversation",
  "update_contact_field",
  "create_deal",
  "wait",
  "condition",
  "send_webhook",
  "close_conversation",
]

const TRIGGER_OPTIONS: { value: AutomationTriggerType }[] = [
  { value: "new_message_received" },
  { value: "first_inbound_message" },
  { value: "keyword_match" },
  { value: "interactive_reply" },
  { value: "new_contact_created" },
  { value: "conversation_assigned" },
  { value: "tag_added" },
  { value: "time_based" },
  { value: "google_sheet_row_added" },
  { value: "google_sheet_row_updated" },
  { value: "google_sheet_row_added_or_updated" },
  { value: "webhook_received" },
]

function cid(): string {
  return (
    "c_" +
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36))
  )
}

// The send_buttons / send_list step_config IS an InteractiveMessagePayload,
// but step_config is typed generically as Record<string, unknown>. These two
// helpers hold the single unavoidable structural cast in one place so a
// payload-shape change has one seam to update instead of four scattered
// `as unknown as` sites.
function toStepConfig(p: InteractiveMessagePayload): Record<string, unknown> {
  return p as unknown as Record<string, unknown>
}
function asInteractive(cfg: Record<string, unknown>): InteractiveMessagePayload {
  return cfg as unknown as InteractiveMessagePayload
}

function blankConfig(type: AutomationStepType): Record<string, unknown> {
  switch (type) {
    case "send_message":
      return { text: "" }
    case "send_buttons":
      return toStepConfig(blankButtonsPayload())
    case "send_list":
      return toStepConfig(blankListPayload())
    case "send_template":
      return { template_name: "", language: "en_US" }
    case "add_tag":
    case "remove_tag":
      return { tag_id: "" }
    case "assign_conversation":
      return { mode: "round_robin" }
    case "update_contact_field":
      return { field: "name", value: "" }
    case "create_deal":
      return { pipeline_id: "", stage_id: "", title: "", value: 0 }
    case "wait":
      return { amount: 1, unit: "hours" }
    case "condition":
      return { subject: "tag_presence", operand: "", value: "" }
    case "send_webhook":
      return { url: "", headers: {}, body_template: "" }
    case "close_conversation":
      return {}
    default:
      return {}
  }
}

// ------------------------------------------------------------
// Account resources (tags, members, approved templates, pipelines)
//
// Loaded once at the builder root and shared via context so the
// tag / agent / template pickers below can offer existing resources
// by name instead of asking the user to paste raw UUIDs. Every picker
// falls back to a raw input when its list is empty (fresh account or
// an older deployment), so an automation is always authorable.
// ------------------------------------------------------------

interface AutomationResources {
  tags: TagRecord[]
  members: AccountMember[]
  templates: MessageTemplate[]
  customFields: CustomField[]
  pipelines: PipelineOption[]
  stages: PipelineStageOption[]
}

interface PipelineOption {
  id: string
  name: string
}

interface PipelineStageOption {
  id: string
  name: string
  pipeline_id: string
  position: number
}

const ResourcesContext = createContext<AutomationResources>({
  tags: [],
  members: [],
  templates: [],
  customFields: [],
  pipelines: [],
  stages: [],
})

function useResources(): AutomationResources {
  return useContext(ResourcesContext)
}

function ResourcesProvider({ children }: { children: ReactNode }) {
  const [tags, setTags] = useState<TagRecord[]>([])
  const [members, setMembers] = useState<AccountMember[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [pipelines, setPipelines] = useState<PipelineOption[]>([])
  const [stages, setStages] = useState<PipelineStageOption[]>([])

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    // Tags, templates and custom fields come straight from the DB — RLS
    // scopes them to the caller's account. Only APPROVED templates can
    // actually be sent (anything else 400s at send time), matching the
    // broadcast picker.
    void (async () => {
      const [tagsRes, templatesRes, customFieldsRes, pipelinesRes, stagesRes] =
        await Promise.all([
          supabase.from("tags").select("*").order("name"),
          supabase
            .from("message_templates")
            .select("*")
            .eq("status", "APPROVED")
            .order("name"),
          supabase.from("custom_fields").select("*").order("field_name"),
          supabase.from("pipelines").select("id, name").order("name"),
          supabase
            .from("pipeline_stages")
            .select("id, name, pipeline_id, position")
            .order("position"),
        ])
      if (cancelled) return
      setTags((tagsRes.data as TagRecord[] | null) ?? [])
      setTemplates((templatesRes.data as MessageTemplate[] | null) ?? [])
      setCustomFields((customFieldsRes.data as CustomField[] | null) ?? [])
      setPipelines((pipelinesRes.data as PipelineOption[] | null) ?? [])
      setStages((stagesRes.data as PipelineStageOption[] | null) ?? [])
    })()

    // Members go through the API so we inherit its email-visibility
    // rules (agents/viewers don't see emails). Unreachable on older
    // deployments → pickers fall back to a raw agent-id input.
    void (async () => {
      try {
        const res = await fetch("/api/account/members", { cache: "no-store" })
        if (!res.ok) return
        const json = (await res.json()) as { members?: AccountMember[] }
        if (!cancelled) setMembers(json.members ?? [])
      } catch {
        // Members endpoint absent — caller falls back to raw input.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <ResourcesContext.Provider
      value={{ tags, members, templates, customFields, pipelines, stages }}
    >
      {children}
    </ResourcesContext.Provider>
  )
}

const SELECT_CLASS =
  "w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"

/** Tag dropdown by name + color, storing the tag's id. Falls back to a
 *  raw id input when no tags exist yet. */
function TagSelect({
  value,
  onChange,
  t,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { tags } = useResources()
  if (tags.length === 0) {
    return (
      <Input
        placeholder={t("tags.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
    )
  }
  const selected = tags.find((t) => t.id === value)
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: selected?.color ?? "transparent" }}
        aria-hidden
      />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{t("tags.select")}</option>
        {tags.map((tg) => (
          <option key={tg.id} value={tg.id}>
            {tg.name}
          </option>
        ))}
        {/* Preserve a saved tag that's since been deleted so editing an
            existing automation doesn't silently drop it. */}
        {value && !selected && (
          <option value={value}>{t("tags.unknown", { id: value })}</option>
        )}
      </select>
    </div>
  )
}

/** Contact-field dropdown for "Update Contact Field": built-in columns plus
 *  any account custom fields (stored as `custom:<id>`). A saved custom field
 *  that's since been deleted is preserved as a labelled option so editing an
 *  existing automation doesn't silently drop it. */
function ContactFieldSelect({
  value,
  onChange,
  t,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { customFields } = useResources()
  const customValue = value.startsWith("custom:") ? value : ""
  const knownCustom =
    customValue && customFields.some((f) => `custom:${f.id}` === customValue)
  return (
    <select
      value={value || "name"}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="name">{t("fields.name")}</option>
      <option value="email">{t("fields.email")}</option>
      <option value="company">{t("fields.company")}</option>
      {customFields.length > 0 && (
        <optgroup label={t("fields.customFields")}>
          {customFields.map((f) => (
            <option key={f.id} value={`custom:${f.id}`}>
              {f.field_name}
            </option>
          ))}
        </optgroup>
      )}
      {customValue && !knownCustom && (
        <option value={customValue}>{t("fields.unknown", { id: customValue })}</option>
      )}
    </select>
  )
}

/** Agent dropdown by name, storing the member's user_id. Falls back to
 *  a raw id input when the member list is unavailable. */
function AgentSelect({
  value,
  onChange,
  t,
}: {
  value: string
  onChange: (v: string) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { members } = useResources()
  if (members.length === 0) {
    return (
      <Input
        placeholder={t("agents.placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-muted text-foreground"
      />
    )
  }
  const selected = members.find((m) => m.user_id === value)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">{t("agents.select")}</option>
      {members.map((m) => (
        <option key={m.user_id} value={m.user_id}>
          {m.full_name || m.email || m.user_id}
        </option>
      ))}
      {value && !selected && (
        <option value={value}>{t("agents.unknown", { id: value })}</option>
      )}
    </select>
  )
}

/** Pipeline + stage picker for Create Deal. The automation stores ids because
 *  the engine writes directly to deals, but authors should choose by name. */
function DealPipelineFields({
  pipelineId,
  stageId,
  onChange,
  t,
}: {
  pipelineId: string
  stageId: string
  onChange: (patch: { pipeline_id: string; stage_id: string }) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { pipelines, stages } = useResources()

  if (pipelines.length === 0) {
    return (
      <>
        <FieldBlock label={t("pipelines.pipelineIdLabel")}>
          <Input
            value={pipelineId}
            onChange={(e) =>
              onChange({ pipeline_id: e.target.value, stage_id: stageId })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        <FieldBlock label={t("pipelines.stageIdLabel")}>
          <Input
            value={stageId}
            onChange={(e) =>
              onChange({ pipeline_id: pipelineId, stage_id: e.target.value })
            }
            className="bg-muted text-foreground"
          />
        </FieldBlock>
      </>
    )
  }

  const selectedPipeline = pipelines.find((p) => p.id === pipelineId)
  const stageOptions = stages.filter((s) => s.pipeline_id === pipelineId)
  const selectedStage = stageOptions.find((s) => s.id === stageId)

  return (
    <>
      <FieldBlock label={t("pipelines.pipelineLabel")}>
        <select
          value={pipelineId}
          onChange={(e) => {
            const nextPipelineId = e.target.value
            const firstStage = stages.find(
              (s) => s.pipeline_id === nextPipelineId
            )
            onChange({
              pipeline_id: nextPipelineId,
              stage_id: firstStage?.id ?? "",
            })
          }}
          className={SELECT_CLASS}
        >
          <option value="">{t("pipelines.selectPipeline")}</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {pipelineId && !selectedPipeline && (
            <option value={pipelineId}>{t("pipelines.unknownPipeline", { id: pipelineId })}</option>
          )}
        </select>
      </FieldBlock>
      <FieldBlock label={t("pipelines.stageLabel")}>
        <select
          value={stageId}
          onChange={(e) =>
            onChange({ pipeline_id: pipelineId, stage_id: e.target.value })
          }
          className={SELECT_CLASS}
          disabled={!pipelineId || stageOptions.length === 0}
        >
          <option value="">
            {pipelineId ? t("pipelines.selectStage") : t("pipelines.selectPipelineFirst")}
          </option>
          {stageOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {stageId && pipelineId && !selectedStage && (
            <option value={stageId}>{t("pipelines.unknownStage", { id: stageId })}</option>
          )}
        </select>
      </FieldBlock>
    </>
  )
}

/** Template dropdown showing approved templates by name + language,
 *  and dynamically rendering variable inputs based on variable types
 *  (text header, media header, body variables, button URL suffixes). */
function SendTemplateFields({
  config,
  onChange,
  t,
}: {
  config: SendTemplateStepConfig
  onChange: (patch: Partial<SendTemplateStepConfig>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const { templates } = useResources()

  const templateName = config.template_name ?? ""
  const language = config.language ?? "en_US"
  const variables = config.variables ?? {}
  const headerVariable = config.header_variable ?? ""
  const headerMediaUrl = config.header_media_url ?? ""
  const buttonVariables = config.button_variables ?? {}

  const toValue = (name: string, lang: string) => `${name}::${lang}`
  const current = templateName ? toValue(templateName, language) : ""
  const selectedTemplate = templates.find(
    (tmpl) =>
      tmpl.name === templateName &&
      (tmpl.language ?? "en_US") === (language || "en_US")
  )

  // Header variable detection
  const hasTextHeaderVar =
    selectedTemplate?.header_type === "text" &&
    !!selectedTemplate.header_content &&
    extractVariableIndices(selectedTemplate.header_content).length > 0

  const hasMediaHeader =
    selectedTemplate?.header_type &&
    ["image", "video", "document"].includes(selectedTemplate.header_type)

  // Body variables
  const bodyVarIndices = selectedTemplate
    ? extractVariableIndices(selectedTemplate.body_text)
    : []

  // Dynamic URL buttons with variables
  const urlButtonsWithVars = (selectedTemplate?.buttons ?? [])
    .map((btn, idx) => ({ btn, idx }))
    .filter(
      ({ btn }) =>
        btn.type === "URL" &&
        "url" in btn &&
        typeof (btn as { url?: string }).url === "string" &&
        extractVariableIndices((btn as { url: string }).url).length > 0
    )
    .map(({ btn, idx }) => ({ btn: btn as { type: "URL"; text: string; url: string }, idx }))

  const hasAnyVariables =
    hasTextHeaderVar ||
    hasMediaHeader ||
    bodyVarIndices.length > 0 ||
    urlButtonsWithVars.length > 0

  function setBodyVariable(idx: number, value: string) {
    onChange({
      variables: {
        ...variables,
        [String(idx)]: value,
      },
    })
  }

  function setButtonVariable(btnIdx: number, value: string) {
    onChange({
      button_variables: {
        ...buttonVariables,
        [String(btnIdx)]: value,
      },
    })
  }

  // Quick insert helper
  function insertToken(currentVal: string, token: string): string {
    return currentVal ? `${currentVal} ${token}` : token
  }

  if (templates.length === 0) {
    return (
      <div className="space-y-3">
        <FieldBlock label={t("templates.templateNameLabel")}>
          <Input
            value={templateName}
            onChange={(e) =>
              onChange({ template_name: e.target.value, language })
            }
            placeholder="e.g. order_confirmation"
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        <FieldBlock label={t("templates.languageLabel")}>
          <Input
            value={language}
            onChange={(e) =>
              onChange({ template_name: templateName, language: e.target.value })
            }
            placeholder="e.g. en_US"
            className="bg-muted text-foreground"
          />
        </FieldBlock>
        {/* Dynamic fallback variable editor */}
        <div className="rounded-md border border-border bg-card/60 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Template Variables ({"{{1}}"}, {"{{2}}"}...)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                const nextIdx = Object.keys(variables).length + 1
                setBodyVariable(nextIdx, "")
              }}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Variable
            </Button>
          </div>
          <div className="space-y-2">
            {Object.keys(variables).length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                No variables added yet. Click &quot;Add Variable&quot; if this template has parameters.
              </p>
            )}
            {Object.keys(variables).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-12">
                  {`{{${key}}}`}
                </span>
                <Input
                  value={variables[key] ?? ""}
                  onChange={(e) =>
                    onChange({
                      variables: { ...variables, [key]: e.target.value },
                    })
                  }
                  placeholder={`Value for {{${key}}}`}
                  className="h-8 bg-muted text-xs text-foreground"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    const next = { ...variables }
                    delete next[key]
                    onChange({ variables: next })
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const hasMatch = templates.some(
    (t) => toValue(t.name, t.language ?? "en_US") === current
  )

  return (
    <div className="space-y-3">
      {/* Recipient Phone (Optional override) */}
      <div className="rounded-md border border-border bg-card/60 p-2.5">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-emerald-400" />
            Recipient Contact Number
          </label>
          <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            Optional
          </span>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Leave empty to use trigger contact, or specify custom phone / variable.
        </p>
        <Input
          value={config.recipient_phone ?? ""}
          onChange={(e) => onChange({ recipient_phone: e.target.value })}
          placeholder="Default: {{ contact.phone }}"
          className="bg-muted text-xs text-foreground font-mono"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onChange({ recipient_phone: "{{ contact.phone }}" })}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
          >
            + contact.phone
          </button>
          <button
            type="button"
            onClick={() => onChange({ recipient_phone: "{{ vars.webhook.body.buyer.phone }}" })}
            className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400 hover:bg-violet-500/20"
          >
            + vars.webhook.body.buyer.phone
          </button>
          <button
            type="button"
            onClick={() => onChange({ recipient_phone: "{{ vars.buyer.phone }}" })}
            className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400 hover:bg-violet-500/20"
          >
            + vars.buyer.phone
          </button>
        </div>
      </div>

      <FieldBlock label={t("templates.templateLabel")}>
        <select
          value={current}
          onChange={(e) => {
            const [name, lang] = e.target.value.split("::")
            onChange({
              template_name: name ?? "",
              language: lang ?? "",
              // Reset variables on template switch
              variables: {},
              header_variable: "",
              header_media_url: "",
              button_variables: {},
            })
          }}
          className={SELECT_CLASS}
        >
          <option value="">{t("templates.select")}</option>
          {templates.map((tmpl) => {
            const lang = tmpl.language ?? "en_US"
            return (
              <option key={tmpl.id} value={toValue(tmpl.name, lang)}>
                {tmpl.name} ({lang})
              </option>
            )
          })}
          {current && !hasMatch && (
            <option value={current}>
              {t("templates.unknown", {
                name: templateName,
                lang: language || t("templates.unknownLang"),
              })}
            </option>
          )}
        </select>
      </FieldBlock>

      {selectedTemplate && (
        <>
          {/* Header Variable: Text with {{1}} */}
          {hasTextHeaderVar && (
            <div className="rounded-md border border-border bg-card/60 p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-400" />
                  Header Text Variable ({"{{1}}"})
                </label>
                <span className="text-[10px] rounded bg-blue-500/10 px-1.5 py-0.5 font-medium text-blue-400">
                  Header
                </span>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground truncate">
                Format: &quot;{selectedTemplate.header_content}&quot;
              </p>
              <Input
                value={headerVariable}
                onChange={(e) => onChange({ header_variable: e.target.value })}
                placeholder="e.g. {{ contact.name }} or custom text"
                className="bg-muted text-xs text-foreground"
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onChange({ header_variable: insertToken(headerVariable, "{{ contact.name }}") })}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                >
                  + contact.name
                </button>
              </div>
            </div>
          )}

          {/* Header Media URL: Image / Video / Document */}
          {hasMediaHeader && (
            <div className="rounded-md border border-border bg-card/60 p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
                  Header {selectedTemplate.header_type?.toUpperCase()} URL
                </label>
                <span className="text-[10px] rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-400 uppercase">
                  {selectedTemplate.header_type}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Enter a public media link or dynamic variable like {`{{ vars.sheet_row.ImageUrl }}`}
              </p>
              <Input
                value={headerMediaUrl}
                onChange={(e) => onChange({ header_media_url: e.target.value })}
                placeholder={selectedTemplate.header_media_url || "https://example.com/image.jpg"}
                className="bg-muted text-xs text-foreground font-mono"
              />
            </div>
          )}

          {/* Body Variables */}
          {bodyVarIndices.length > 0 && (
            <div className="space-y-2.5 rounded-md border border-border bg-card/60 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Body Variables
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {bodyVarIndices.length} {bodyVarIndices.length === 1 ? "variable" : "variables"}
                </span>
              </div>

              {bodyVarIndices.map((idx) => {
                const sample = selectedTemplate.sample_values?.body?.[idx - 1]
                const val = variables[String(idx)] ?? ""
                return (
                  <div key={idx} className="space-y-1 rounded border border-border/60 bg-muted/40 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">
                        Variable {`{{${idx}}}`}
                      </span>
                      {sample && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                          Sample: {sample}
                        </span>
                      )}
                    </div>
                    <Input
                      value={val}
                      onChange={(e) => setBodyVariable(idx, e.target.value)}
                      placeholder={sample ? `e.g. ${sample}` : `Value for {{${idx}}}`}
                      className="bg-background text-xs text-foreground"
                    />
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setBodyVariable(idx, insertToken(val, "{{ contact.name }}"))}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                      >
                        + contact.name
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyVariable(idx, insertToken(val, "{{ contact.phone }}"))}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
                      >
                        + contact.phone
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyVariable(idx, insertToken(val, "{{ vars.webhook. }}"))}
                        className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
                        title="Access any field from incoming webhook"
                      >
                        + vars.webhook.*
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Button Variables */}
          {urlButtonsWithVars.length > 0 && (
            <div className="space-y-2.5 rounded-md border border-border bg-card/60 p-2.5">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5 text-cyan-400" />
                Button URL Parameters
              </span>
              {urlButtonsWithVars.map(({ btn, idx }) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      &quot;{btn.text}&quot; URL Suffix
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate font-mono">
                    {btn.url}
                  </p>
                  <Input
                    value={buttonVariables[String(idx)] ?? ""}
                    onChange={(e) => setButtonVariable(idx, e.target.value)}
                    placeholder="e.g. {{ vars.sheet_row.OrderId }} or suffix"
                    className="bg-muted text-xs text-foreground"
                  />
                </div>
              ))}
            </div>
          )}

          {!hasAnyVariables && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>This template has no dynamic variables. It will send static approved content.</span>
            </div>
          )}

          {/* Live WhatsApp Message Preview */}
          <div className="mt-3 space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live WhatsApp Preview
            </span>
            <div className="rounded-lg border border-border bg-muted/60 p-3 shadow-inner">
              <div className="rounded-lg border border-border bg-card p-3 shadow-sm space-y-2 text-xs">
                {/* Header preview */}
                {selectedTemplate.header_type === "text" && selectedTemplate.header_content && (
                  <div className="font-bold text-foreground">
                    {selectedTemplate.header_content.replace(/\{\{1\}\}/g, headerVariable || "{{1}}")}
                  </div>
                )}
                {hasMediaHeader && (
                  <div className="flex items-center justify-center rounded border border-dashed border-border bg-muted/50 py-4 text-xs text-muted-foreground gap-2">
                    <ImageIcon className="h-4 w-4" />
                    <span>[{selectedTemplate.header_type?.toUpperCase()} HEADER]</span>
                  </div>
                )}

                {/* Body preview */}
                <div className="whitespace-pre-wrap leading-relaxed text-foreground">
                  {selectedTemplate.body_text.split(/(\{\{\d+\}\})/).map((part, i) => {
                    const match = part.match(/^\{\{(\d+)\}\}$/)
                    if (match) {
                      const num = match[1]
                      const val = variables[num]
                      if (val) {
                        return (
                          <span key={i} className="font-semibold text-primary underline decoration-primary/50">
                            {val}
                          </span>
                        )
                      }
                      return (
                        <span key={i} className="rounded bg-amber-500/10 px-1 py-0.5 font-mono text-[11px] text-amber-400">
                          {part}
                        </span>
                      )
                    }
                    return <span key={i}>{part}</span>
                  })}
                </div>

                {/* Footer preview */}
                {selectedTemplate.footer_text && (
                  <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-1">
                    {selectedTemplate.footer_text}
                  </div>
                )}

                {/* Buttons preview */}
                {selectedTemplate.buttons && selectedTemplate.buttons.length > 0 && (
                  <div className="space-y-1 border-t border-border/60 pt-2">
                    {selectedTemplate.buttons.map((b, bi) => (
                      <div
                        key={bi}
                        className="flex items-center justify-center gap-1.5 rounded border border-border/80 bg-muted/40 py-1 text-[11px] font-medium text-foreground"
                      >
                        {b.type === "URL" && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                        <span>{b.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Main builder component
// ------------------------------------------------------------

export function AutomationBuilder({ initial }: { initial: BuilderInitial }) {
  const router = useRouter()
  const t = useTranslations("Automations.builder")
  const isEditing = !!initial.id
  const [state, setState] = useState<BuilderInitial>(initial)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function patchTop<K extends keyof BuilderInitial>(key: K, value: BuilderInitial[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  // --- Step tree mutations (immutable) ---

  function updateStep(path: StepPath, updater: (s: BuilderStep) => BuilderStep) {
    setState((s) => ({ ...s, steps: mapAtPath(s.steps, path, updater) }))
  }

  function addStepAt(parent: ParentScope, index: number, type: AutomationStepType) {
    const node: BuilderStep = {
      cid: cid(),
      step_type: type,
      step_config: blankConfig(type),
      branches: type === "condition" ? { yes: [], no: [] } : undefined,
    }
    setState((s) => ({ ...s, steps: insertAt(s.steps, parent, index, node) }))
    setExpandedId(node.cid)
  }

  function deleteStepAt(path: StepPath) {
    setState((s) => ({ ...s, steps: removeAt(s.steps, path) }))
  }

  function moveStepAt(path: StepPath, direction: -1 | 1) {
    setState((s) => ({ ...s, steps: moveAt(s.steps, path, direction) }))
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        name: state.name || "Untitled automation",
        description: state.description || null,
        trigger_type: state.trigger_type,
        trigger_config: state.trigger_config,
        is_active: state.is_active,
        steps: toApiSteps(state.steps),
      }

      const res = isEditing
        ? await fetch(`/api/automations/${initial.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/automations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })

      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // If the server blocked activation with validation issues,
        // surface the first concrete problem so the user can fix it
        // without opening DevTools for the full array.
        const firstIssue: { path?: string; message?: string } | undefined =
          body?.issues?.[0]
        if (firstIssue?.message) {
          toast.error(firstIssue.message, {
            description: firstIssue.path ? `at ${firstIssue.path}` : undefined,
          })
        } else {
          toast.error(body?.error ?? t("toasts.saveFailed"))
        }
        return
      }
      toast.success(isEditing ? t("toasts.saved") : t("toasts.created"))
      if (!isEditing && body?.automation?.id) {
        router.replace(`/automations/${body.automation.id}/edit`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Top bar. At sub-sm widths the "Active" label is hidden and the
          switch moves to the right of the save button, so the name input
          gets maximum width. */}
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/automations")}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("backToAutomations")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <input
          value={state.name}
          onChange={(e) => patchTop("name", e.target.value)}
          placeholder={t("untitled")}
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:bg-muted focus:outline-none sm:text-base"
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{t("active")}</span>
          <Switch
            checked={state.is_active}
            onCheckedChange={(v) => patchTop("is_active", !!v)}
            aria-label={t("activeAria")}
          />
        </div>
        {isEditing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/automations/${initial.id}/logs`)}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Logs</span>
          </Button>
        )}
        <Button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isEditing ? t("save") : t("saveDraft")}
        </Button>
      </header>

      {/* Canvas */}
      <div className="relative flex-1 overflow-y-auto">
        <div className="absolute inset-0 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-0 px-4 py-10">
          <ResourcesProvider>
            <TriggerCard
              type={state.trigger_type}
              config={state.trigger_config}
              automationId={state.id}
              onTypeChange={(tVal) => patchTop("trigger_type", tVal)}
              onConfigChange={(c) => patchTop("trigger_config", c)}
              t={t}
            />
            <StepList
              steps={state.steps}
              basePath={[]}
              scope={{ kind: "root" }}
              expandedId={expandedId}
              setExpandedId={setExpandedId}
              updateStep={updateStep}
              addStepAt={addStepAt}
              deleteStepAt={deleteStepAt}
              moveStepAt={moveStepAt}
            />
          </ResourcesProvider>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Trigger card
// ------------------------------------------------------------

function TriggerCard({
  type,
  config,
  automationId,
  onTypeChange,
  onConfigChange,
  t,
}: {
  type: AutomationTriggerType
  config: Record<string, unknown>
  automationId?: string
  onTypeChange: (t: AutomationTriggerType) => void
  onConfigChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [open, setOpen] = useState(false)
  return (
    // Card width: full on mobile, fixed 320px on sm+. The canvas wrapper
    // (max-w-2xl + px-4) keeps this tidy on tablet/desktop.
    <div className="z-10 w-full max-w-[320px] sm:w-80">
      <div className="rounded-lg border border-border border-l-4 border-l-blue-500 bg-card shadow-lg">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
            <Zap className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-blue-300">{t("trigger")}</div>
            <div className="truncate text-sm font-medium text-foreground">
              {t(`triggers.${type}.label`)}
            </div>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
        {open && (
          <div className="space-y-3 border-t border-border px-4 py-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("triggerType")}
              </label>
              <select
                value={type}
                onChange={(e) => onTypeChange(e.target.value as AutomationTriggerType)}
                className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(`triggers.${o.value}.label`)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(`triggers.${type}.hint`)}
              </p>
            </div>
            {type === "keyword_match" && (
              <KeywordMatchConfig
                config={config as unknown as KeywordMatchTriggerConfig}
                onChange={onConfigChange}
                t={t}
              />
            )}
            {type === "interactive_reply" && (
              <InteractiveReplyConfig config={config} onChange={onConfigChange} t={t} />
            )}
            {type === "tag_added" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Tag
                </label>
                <TagSelect
                  value={(config.tag_id as string) ?? ""}
                  onChange={(v) => onConfigChange({ ...config, tag_id: v })}
                  t={t}
                />
              </div>
            )}
            {type === "time_based" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("schedule")}
                </label>
                <Input
                  placeholder="Cron expression or HH:mm"
                  value={(config.schedule as string) ?? ""}
                  onChange={(e) =>
                    onConfigChange({ ...config, schedule: e.target.value })
                  }
                  className="bg-muted text-foreground"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("scheduleHint")}
                </p>
              </div>
            )}
            {(type === "google_sheet_row_added" ||
              type === "google_sheet_row_updated" ||
              type === "google_sheet_row_added_or_updated") && (
              <GoogleSheetConfig
                config={config}
                onChange={onConfigChange}
                t={t}
              />
            )}
            {type === "webhook_received" && (
              <WebhookListenerConfig
                automationId={automationId}
                config={config}
                onChange={onConfigChange}
                t={t}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function KeywordMatchConfig({
  config,
  onChange,
  t,
}: {
  config: KeywordMatchTriggerConfig
  onChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const keywords = config?.keywords ?? []
  // Keep a local draft string so the comma and trailing space aren't
  // stripped on every keystroke (which made multi-word, comma-separated
  // entry like "SEO, search engine optimization" impossible to type).
  // We only parse into the keywords array on blur, then re-display the
  // cleaned, rejoined form. Seeded once on mount; this component remounts
  // when the trigger type changes, so the seed stays in sync.
  const [draft, setDraft] = useState(keywords.join(", "))

  // Persist the default the <select> displays. The dropdown falls back to
  // "contains" for display, but leaving it untouched would otherwise omit
  // match_type from the saved config — and activation validation then
  // rejected it (trigger.match_type). Seed once on mount; the component
  // remounts when the trigger type changes, matching the keywords draft.
  useEffect(() => {
    if (config?.match_type == null) {
      onChange({ ...config, match_type: "contains" })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function commit() {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setDraft(parsed.join(", "))
    onChange({ ...config, keywords: parsed })
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("keywords")}
        </label>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            }
          }}
          placeholder={t("keywordsHint")}
          className="bg-muted text-foreground"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("config.matchType")}
        </label>
        <select
          value={config?.match_type ?? "contains"}
          onChange={(e) =>
            onChange({
              ...config,
              match_type: e.target.value as "exact" | "contains" | "word",
            })
          }
          className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:outline-none"
        >
          <option value="contains">{t("config.matchContains")}</option>
          <option value="word">{t("config.matchWord")}</option>
          <option value="exact">{t("config.matchExact")}</option>
        </select>
        {/* Only worth explaining for `word` — "contains" and "exact" read
            for themselves, and this is the one that changes which messages
            fire an automation in a way that isn't obvious. */}
        {config?.match_type === "word" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("config.matchWordHint")}
          </p>
        )}
      </div>
    </div>
  )
}

function InteractiveReplyConfig({
  config,
  onChange,
  t,
}: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const ids = (config?.reply_ids as string[] | undefined) ?? []
  // Same local-draft-then-commit pattern as KeywordMatchConfig so
  // commas + spaces survive keystrokes.
  const [draft, setDraft] = useState(ids.join(", "))

  function commit() {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setDraft(parsed.join(", "))
    onChange({ ...config, reply_ids: parsed })
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {t("replyIds")}
      </label>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          }
        }}
        placeholder={t("replyIdsHint")}
        className="bg-muted font-mono text-foreground"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{t("replyIdsHelp")}</p>
    </div>
  )
}

function GoogleSheetConfig({
  config,
  onChange,
  t,
}: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [spreadsheets, setSpreadsheets] = useState<{ id: string; name: string }[]>([])
  const [sheets, setSheets] = useState<string[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [connected, setConnected] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const spreadsheetId = (config.spreadsheetId as string) ?? ""
  const sheetName = (config.sheetName as string) ?? ""
  const phoneColumn = (config.phoneColumn as string) ?? ""
  const nameColumn = (config.nameColumn as string) ?? ""
  const emailColumn = (config.emailColumn as string) ?? ""
  const pollInterval = (config.pollIntervalMinutes as number) ?? 5

  // Check connection status + load spreadsheet list on mount.
  useEffect(() => {
    let cancelled = false

    // The OAuth callback redirects back with ?gsheets_error=... on
    // failure. Read it once from the URL (not useSearchParams — the
    // edit page has no Suspense boundary) and surface the reason.
    const oauthError = new URLSearchParams(window.location.search).get('gsheets_error')
    if (oauthError) {
      if (oauthError === 'no_refresh_token') {
        setError(
          'Google did not return a refresh token. Revoke this app at ' +
          'https://myaccount.google.com/permissions, then click Connect Google again.'
        )
      } else if (oauthError === 'token_exchange_failed') {
        setError('Google rejected the authorization code. Please try connecting again.')
      } else if (oauthError === 'persist_failed') {
        setError('Connected, but saving the token failed. Check server logs and retry.')
      } else if (oauthError === 'unauthorized') {
        setError('Your session expired during the Google connect flow. Sign in again and retry.')
      } else {
        setError(`Google connect failed (${oauthError}). Please try again.`)
      }
    }

    setLoading(true)
    fetch('/api/google-sheets/spreadsheets')
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json()
          if (!cancelled) {
            setConnected(true)
            setSpreadsheets(json.spreadsheets ?? [])
          }
        } else {
          const json = await res.json().catch(() => null)
          const message = json?.error ?? `HTTP ${res.status}`
          if (!cancelled) {
            // 400 = genuinely not connected → show the connect button.
            // Any other status means the token IS saved but the
            // spreadsheet list failed (e.g. Drive API disabled) —
            // show connected with the error so it doesn't look like
            // a reconnect loop.
            if (res.status === 400) {
              setConnected(false)
            } else {
              setConnected(true)
              setError(message)
            }
          }
        }
      })
      .catch(() => { if (!cancelled) setConnected(false) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Load tabs when a spreadsheet is selected.
  useEffect(() => {
    if (!spreadsheetId) {
      setSheets([])
      return
    }
    let cancelled = false
    fetch(`/api/google-sheets/spreadsheets?spreadsheetId=${encodeURIComponent(spreadsheetId)}`)
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json()
          if (!cancelled) setSheets(json.sheets ?? [])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [spreadsheetId])

  // Load column headers when a tab is selected — used for the phone
  // column picker and to show which {{ vars.sheet_row.* }} are usable.
  useEffect(() => {
    if (!spreadsheetId || !sheetName) {
      setHeaders([])
      return
    }
    let cancelled = false
    fetch(
      `/api/google-sheets/spreadsheets?spreadsheetId=${encodeURIComponent(spreadsheetId)}&sheetName=${encodeURIComponent(sheetName)}`,
    )
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json()
          if (!cancelled) setHeaders(json.headers ?? [])
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [spreadsheetId, sheetName])

  function connectGoogle() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId) {
      setError('Google is not configured on this deployment')
      return
    }
    const redirectUri = `${window.location.origin}/api/google-sheets/oauth/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly',
      access_type: 'offline',
      prompt: 'consent',
      // Carry the originating page so the callback can return here
      // instead of the automations list. Path-only — no host — so it
      // can't be turned into an open redirect.
      state: window.location.pathname + window.location.search,
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  // Only show full loading fallback when configuring a brand new trigger with no spreadsheet selected yet
  if (loading && !spreadsheetId) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        Checking Google connection…
      </div>
    )
  }

  if (connected === false && !spreadsheetId) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Connect your Google account to pick a spreadsheet.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={connectGoogle}>
          Connect Google
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-medium text-muted-foreground">
            Spreadsheet
          </label>
          {loading && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Syncing…
            </span>
          )}
        </div>
        <select
          value={spreadsheetId}
          onChange={(e) => {
            const selected = spreadsheets.find((s) => s.id === e.target.value)
            onChange({
              ...config,
              spreadsheetId: e.target.value,
              spreadsheetName: selected?.name ?? '',
              sheetName: '',
              phoneColumn: '',
              nameColumn: '',
              emailColumn: '',
            })
          }}
          className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">Select a spreadsheet…</option>
          {spreadsheetId && !spreadsheets.some((s) => s.id === spreadsheetId) && (
            <option value={spreadsheetId}>
              {(config.spreadsheetName as string) || 'Loading spreadsheet…'}
            </option>
          )}
          {spreadsheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Sheet tab
        </label>
        <select
          value={sheetName}
          onChange={(e) =>
            onChange({
              ...config,
              sheetName: e.target.value,
              phoneColumn: '',
              nameColumn: '',
              emailColumn: '',
            })
          }
          disabled={!spreadsheetId}
          className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
        >
          <option value="">
            {spreadsheetId ? 'Select a tab…' : 'Pick a spreadsheet first'}
          </option>
          {sheetName && !sheets.includes(sheetName) && (
            <option value={sheetName}>{sheetName}</option>
          )}
          {sheets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {sheetName && (
        <div className="space-y-3 pt-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Phone number column <span className="text-destructive">*</span>
            </label>
            <select
              value={phoneColumn}
              onChange={(e) => onChange({ ...config, phoneColumn: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Auto-detect (Phone / WhatsApp / Mobile…)</option>
              {phoneColumn && !headers.includes(phoneColumn) && (
                <option value={phoneColumn}>{phoneColumn}</option>
              )}
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              The value in this column is used as the WhatsApp number to send messages to.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Contact name column <span className="font-normal text-muted-foreground/70">(optional)</span>
            </label>
            <select
              value={nameColumn}
              onChange={(e) => onChange({ ...config, nameColumn: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Auto-detect (Name / Full Name / Client…)</option>
              {nameColumn && !headers.includes(nameColumn) && (
                <option value={nameColumn}>{nameColumn}</option>
              )}
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Saves the contact's name in CRM and inbox when creating new contacts from rows.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Contact email column <span className="font-normal text-muted-foreground/70">(optional)</span>
            </label>
            <select
              value={emailColumn}
              onChange={(e) => onChange({ ...config, emailColumn: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">Auto-detect (Email / Mail…)</option>
              {emailColumn && !headers.includes(emailColumn) && (
                <option value={emailColumn}>{emailColumn}</option>
              )}
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Poll interval (minutes)
        </label>
        <Input
          type="number"
          min={1}
          max={60}
          value={pollInterval}
          onChange={(e) =>
            onChange({ ...config, pollIntervalMinutes: Number(e.target.value) || 1 })
          }
          className="bg-muted text-foreground"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          How often the sheet is checked for changes.
        </p>
      </div>
      {sheetName && headers.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Row values are available in message steps:{" "}
          {headers.slice(0, 6).map((h) => (
            <code key={h} className="mr-1 font-mono">
              {`{{ vars.sheet_row.${h} }}`}
            </code>
          ))}
          {headers.length > 6 && ` +${headers.length - 6} more`}
        </p>
      )}
      {!sheetName && (
        <p className="text-[11px] text-muted-foreground">
          Row values are available as <code className="font-mono">{'{{ vars.sheet_row.<Column> }}'}</code> in
          message steps — e.g. <code className="font-mono">{'{{ vars.sheet_row.Phone }}'}</code>.
        </p>
      )}
    </div>
  )
}

function WebhookListenerConfig({
  automationId,
  config,
  onChange,
  t: _t,
}: {
  automationId?: string
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  t: ReturnType<typeof useTranslations>
}) {
  const [copied, setCopied] = useState(false)
  const [copiedCurl, setCopiedCurl] = useState(false)
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const webhookUrl = automationId
    ? `${origin}/api/automations/webhook/${automationId}`
    : ""

  const secret = (config.secret as string) ?? ""

  // Sample or received JSON payload
  const defaultSample = {
    phone: "919876543210",
    name: "John Doe",
    order_id: "ORD-1234",
    amount: "$99.00",
  }

  const samplePayload =
    (config.samplePayload as Record<string, unknown>) || defaultSample

  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(samplePayload, null, 2)
  )
  const [jsonError, setJsonError] = useState<string | null>(null)

  function handleJsonChange(text: string) {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed === "object" && parsed !== null) {
        setJsonError(null)
        onChange({ ...config, samplePayload: parsed })
      } else {
        setJsonError("Valid JSON object or array expected")
      }
    } catch {
      setJsonError("Invalid JSON format")
    }
  }

  function copyUrl() {
    if (!automationId) {
      toast.error("Please save the automation first to generate your unique webhook URL.")
      return
    }
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    toast.success("Webhook URL copied to clipboard!")
    setTimeout(() => setCopied(false), 2000)
  }

  function generateSecret() {
    const s =
      "whsec_" +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10)
    onChange({ ...config, secret: s })
    toast.success("Generated secret! Click Save to apply.")
  }

  const testCurl = automationId
    ? `curl -X POST "${webhookUrl}${secret ? `?secret=${secret}` : ""}" -H "Content-Type: application/json" -d '${JSON.stringify(samplePayload)}'`
    : ""

  function copyCurl() {
    if (!testCurl) return
    navigator.clipboard.writeText(testCurl)
    setCopiedCurl(true)
    toast.success("Test cURL command copied!")
    setTimeout(() => setCopiedCurl(false), 2000)
  }

  function extractPaths(val: unknown, prefix = "", maxDepth = 4): string[] {
    if (!val || typeof val !== "object" || maxDepth <= 0) return []
    if (Array.isArray(val)) {
      if (val.length === 0) return []
      return extractPaths(val[0], prefix, maxDepth - 1)
    }
    const paths: string[] = []
    for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
      if (prefix === "" && (key === "headers" || key === "params" || key === "query")) {
        continue
      }
      const currentPath = prefix ? `${prefix}.${key}` : key
      if (!child || typeof child !== "object") {
        paths.push(currentPath)
      } else {
        const sub = extractPaths(child, currentPath, maxDepth - 1)
        if (sub.length > 0) {
          paths.push(...sub)
        } else {
          paths.push(currentPath)
        }
      }
    }
    return paths
  }

  const extractedKeys = Array.from(new Set(extractPaths(samplePayload)))

  return (
    <div className="space-y-3">
      {/* Webhook URL */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Webhook className="h-3.5 w-3.5 text-violet-400" />
            Webhook URL
          </label>
          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">
            POST
          </span>
        </div>
        {automationId ? (
          <div className="flex items-center gap-1.5">
            <Input
              readOnly
              value={webhookUrl}
              className="bg-muted text-xs font-mono text-foreground select-all"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyUrl}
              className="h-9 px-2.5 flex-shrink-0 gap-1 text-xs"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
        ) : (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-300">
            Save this automation once to generate its unique webhook URL.
          </div>
        )}
      </div>

      {/* Secret Token */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs font-medium text-muted-foreground">
            Secret Token (Optional)
          </label>
          <button
            type="button"
            onClick={generateSecret}
            className="text-[11px] text-primary hover:underline"
          >
            Generate Secret
          </button>
        </div>
        <Input
          value={secret}
          onChange={(e) => onChange({ ...config, secret: e.target.value })}
          placeholder="Leave blank for open webhook, or enter secret"
          className="bg-muted text-xs text-foreground font-mono"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Passed as header{" "}
          <code className="font-mono text-foreground">
            x-webhook-secret: &lt;token&gt;
          </code>{" "}
          or query{" "}
          <code className="font-mono text-foreground">
            ?secret=&lt;token&gt;
          </code>.
        </p>
      </div>

      {/* JSON Payload Data */}
      <div className="rounded-md border border-border bg-card/60 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-violet-400" />
            JSON Format Data
          </span>
          <span className="text-[10px] text-muted-foreground">
            Paste sample JSON below
          </span>
        </div>
        <Textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          placeholder='{\n  "phone": "919876543210",\n  "name": "John Doe",\n  "order_id": "ORD-1234"\n}'
          rows={5}
          className="font-mono text-xs bg-muted text-foreground resize-y leading-tight"
        />
        {jsonError && (
          <p className="text-[11px] text-destructive">{jsonError}</p>
        )}

        {extractedKeys.length > 0 && (
          <div className="pt-1">
            <span className="text-[11px] font-medium text-muted-foreground block mb-1">
              Available variables (click to copy):
            </span>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {extractedKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`{{ vars.webhook.${k} }}`)
                    toast.success(`Copied {{ vars.webhook.${k} }}!`)
                  }}
                  className="rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 px-1.5 py-0.5 text-[10px] font-mono transition-colors"
                  title="Click to copy variable token"
                >
                  + {k}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Variable Reference */}
      <div className="rounded border border-border bg-muted/40 p-2 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Using Webhook Variables</p>
        <p className="text-[11px]">
          All JSON properties are available in any message step via:
        </p>
        <code className="block rounded bg-background p-1 font-mono text-[11px] text-primary">
          {"{{ vars.webhook.<field_name> }}"}
        </code>
      </div>

      {/* Test cURL Command */}
      {automationId && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Test via Terminal
            </span>
            <button
              type="button"
              onClick={copyCurl}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              {copiedCurl ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedCurl ? "Copied" : "Copy cURL"}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-muted/80 p-2 font-mono text-[10px] text-muted-foreground whitespace-pre-wrap">
            {testCurl}
          </pre>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Step list + card + connectors
// ------------------------------------------------------------

interface StepListProps {
  steps: BuilderStep[]
  /**
   * Path of the step that owns this list — `[]` for the root canvas,
   * the condition's own path for a branch column. Combined with
   * `scope` by `childPath` to address each child.
   */
  basePath: StepPath
  /** Which bucket this list reads and writes. */
  scope: ParentScope
  expandedId: string | null
  setExpandedId: (id: string | null) => void
  updateStep: (path: StepPath, updater: (s: BuilderStep) => BuilderStep) => void
  addStepAt: (parent: ParentScope, index: number, type: AutomationStepType) => void
  deleteStepAt: (path: StepPath) => void
  moveStepAt: (path: StepPath, direction: -1 | 1) => void
}

function StepList(props: StepListProps) {
  const { steps, basePath, scope, ...rest } = props

  return (
    <div className="flex w-full flex-col items-center">
      <AddButton onPick={(t) => props.addStepAt(scope, 0, t)} />
      {steps.map((step, idx) => (
        <StepRenderer
          key={step.cid}
          step={step}
          index={idx}
          total={steps.length}
          basePath={basePath}
          scope={scope}
          {...rest}
        />
      ))}
    </div>
  )
}

function StepRenderer({
  step,
  index,
  total,
  scope,
  basePath,
  ...props
}: {
  step: BuilderStep
  index: number
  total: number
  scope: ParentScope
  basePath: StepPath
} & Omit<StepListProps, "steps" | "basePath" | "scope">) {
  const t = useTranslations("Automations.builder")
  const path = childPath(basePath, scope, index)
  const meta = STEP_META[step.step_type]
  const Icon = meta.icon
  const expanded = props.expandedId === step.cid
  const isCondition = step.step_type === "condition"
  const nested = basePath.length > 0
  // Card widths on mobile fill the full canvas column (max-w-2xl px-4
  // still keeps them reasonable). On sm+ fixed widths come back so the
  // flow visual stays recognisable — but only at the top level: a
  // branch column is a fraction of its condition's width, so a 320px
  // card inside one overflowed its own column and dragged the editor's
  // controls out of reach (issue #474). Nested cards fill the column
  // they were given instead.
  //
  // A condition is wider than a plain step because it has to hold two
  // branch columns side by side; 600px (the canvas is max-w-2xl, i.e.
  // 640px of content) leaves each branch ~294px — near enough to the
  // 320px a step gets at the top level for the same editors to fit.
  const width = nested
    ? "w-full"
    : isCondition
      ? "w-full max-w-[600px] sm:w-[600px]"
      : "w-full max-w-[320px] sm:w-80"

  return (
    <>
      <div className={cn("z-10 flex min-w-0 flex-col", width)}>
        <div
          className={cn(
            "rounded-lg border border-border border-l-4 bg-card shadow-lg",
            meta.border,
          )}
        >
          <button
            type="button"
            onClick={() => props.setExpandedId(expanded ? null : step.cid)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <GripVertical className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {isCondition ? "Condition" : step.step_type === "wait" ? "Wait" : "Action"}
              </div>
              <div className="truncate text-sm font-medium text-foreground">{t(`steps.${meta.label}`)}</div>
              <div className="truncate text-[11px] text-muted-foreground">{previewFor(step)}</div>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
            />
          </button>
          {expanded && (
            <div className="border-t border-border px-4 py-3">
              <StepEditor
                step={step}
                onChange={(next) => props.updateStep(path, () => next)}
              />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    aria-label="Move up"
                    onClick={() => props.moveStepAt(path, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === total - 1}
                    aria-label="Move down"
                    onClick={() => props.moveStepAt(path, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => props.deleteStepAt(path)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("delete")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isCondition && (
          <ConditionBranches step={step} path={path} {...props} />
        )}
      </div>

      {/* A condition branches into Yes/No (rendered above by
          ConditionBranches), so it has no linear "continue" path — adding
          the trailing connector here would produce a spurious third output. */}
      {!isCondition && (
        <AddButton onPick={(t) => props.addStepAt(scope, index + 1, t)} />
      )}
    </>
  )
}

function ConditionBranches({
  step,
  path,
  ...props
}: {
  step: BuilderStep
  /** The condition's OWN path. Children hang off it, one marker each. */
  path: StepPath
} & Omit<StepListProps, "steps" | "basePath" | "scope">) {
  const t = useTranslations("Automations.builder")
  const yes = step.branches?.yes ?? []
  const no = step.branches?.no ?? []
  return (
    // Stack Yes/No vertically until THIS CARD is wide enough for two
    // columns. A viewport breakpoint can't tell: a condition nested in
    // a branch is a fraction of the screen, and `sm:grid-cols-2` split
    // it anyway, leaving two columns too narrow to render a step in.
    <div className="@container mt-3 w-full">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <BranchColumn label={t("branches.yes")} color="text-primary">
          <StepList
            {...props}
            steps={yes}
            basePath={path}
            scope={{ kind: "branch", parentCid: step.cid, branch: "yes" }}
          />
        </BranchColumn>
        <BranchColumn label={t("branches.no")} color="text-rose-400">
          <StepList
            {...props}
            steps={no}
            basePath={path}
            scope={{ kind: "branch", parentCid: step.cid, branch: "no" }}
          />
        </BranchColumn>
      </div>
    </div>
  )
}

function BranchColumn({
  label,
  color,
  children,
}: {
  label: string
  color: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className={cn("mb-2 text-[11px] font-semibold uppercase", color)}>{label}</div>
      {children}
    </div>
  )
}

function AddButton({ onPick }: { onPick: (t: AutomationStepType) => void }) {
  const t = useTranslations("Automations.builder")
  return (
    <div className="relative flex flex-col items-center">
      <div className="h-4 w-[2px] bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary data-[popup-open]:border-primary data-[popup-open]:bg-primary/20 data-[popup-open]:text-primary"
          aria-label={t("addStep")}
        >
          <Plus className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 min-w-56 overflow-y-auto border-border bg-popover"
        >
          {ADDABLE_STEPS.map((tp) => {
            const Icon = STEP_META[tp].icon
            return (
              <DropdownMenuItem key={tp} onClick={() => onPick(tp)}>
                <Icon className="h-4 w-4" />
                {t(`steps.${STEP_META[tp].label}`)}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="h-4 w-[2px] bg-border" aria-hidden />
    </div>
  )
}

// ------------------------------------------------------------
// Per-step config editor
// ------------------------------------------------------------

function StepEditor({
  step,
  onChange,
}: {
  step: BuilderStep
  onChange: (s: BuilderStep) => void
}) {
  const t = useTranslations("Automations.builder")
  const cfg = step.step_config
  const set = (patch: Record<string, unknown>) =>
    onChange({ ...step, step_config: { ...cfg, ...patch } })

  switch (step.step_type) {
    case "send_message":
      return (
        <div className="space-y-3">
          <FieldBlock label="Recipient Contact Number (Optional)">
            <Input
              value={(cfg.recipient_phone as string) ?? ""}
              onChange={(e) => set({ recipient_phone: e.target.value })}
              placeholder="Default: {{ contact.phone }}"
              className="bg-muted text-xs text-foreground font-mono"
            />
          </FieldBlock>
          <FieldBlock label={t("config.messageText")}>
            <Textarea
              value={(cfg.text as string) ?? ""}
              onChange={(e) => set({ text: e.target.value })}
              placeholder={t("config.placeholderMessageText")}
              className="min-h-24 bg-muted text-foreground"
            />
          </FieldBlock>
        </div>
      )
    case "send_buttons":
    case "send_list":
      // The whole step_config IS the interactive payload; the shared
      // builder edits it in place (and enforces Meta's limits + preview).
      return (
        <InteractiveBuilder
          value={asInteractive(cfg)}
          onChange={(payload) =>
            onChange({ ...step, step_config: toStepConfig(payload) })
          }
        />
      )
    case "send_template":
      return (
        <SendTemplateFields
          config={cfg as unknown as SendTemplateStepConfig}
          onChange={(patch) => set(patch)}
          t={t}
        />
      )
    case "add_tag":
    case "remove_tag":
      return (
        <FieldBlock label={t("config.tagLabel")}>
          <TagSelect
            value={(cfg.tag_id as string) ?? ""}
            onChange={(v) => set({ tag_id: v })}
            t={t}
          />
        </FieldBlock>
      )
    case "assign_conversation":
      return (
        <>
          <FieldBlock label={t("config.modeLabel")}>
            <select
              value={(cfg.mode as string) ?? "round_robin"}
              onChange={(e) => set({ mode: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="round_robin">{t("config.modes.round_robin")}</option>
              <option value="specific">{t("config.modes.specific")}</option>
            </select>
          </FieldBlock>
          {cfg.mode === "specific" && (
            <FieldBlock label={t("config.agentLabel")}>
              <AgentSelect
                value={(cfg.agent_id as string) ?? ""}
                onChange={(v) => set({ agent_id: v })}
                t={t}
              />
            </FieldBlock>
          )}
        </>
      )
    case "update_contact_field":
      return (
        <>
          <FieldBlock label={t("config.fieldLabel")}>
            <ContactFieldSelect
              value={(cfg.field as string) ?? "name"}
              onChange={(v) => set({ field: v })}
              t={t}
            />
          </FieldBlock>
          <FieldBlock label={t("config.valueLabel")}>
            <Input
              value={(cfg.value as string) ?? ""}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={t.raw("config.placeholderValue")}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
        </>
      )
    case "create_deal":
      return (
        <>
          <DealPipelineFields
            pipelineId={(cfg.pipeline_id as string) ?? ""}
            stageId={(cfg.stage_id as string) ?? ""}
            onChange={(patch) => set(patch)}
            t={t}
          />
          <FieldBlock label={t("config.titleLabel")}>
            <Input
              value={(cfg.title as string) ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.valueLabel")}>
            <Input
              type="number"
              value={(cfg.value as number) ?? 0}
              onChange={(e) => set({ value: Number(e.target.value) })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
        </>
      )
    case "wait":
      return (
        <div className="grid grid-cols-2 gap-2">
          <FieldBlock label={t("config.amountLabel")}>
            <Input
              type="number"
              min={1}
              value={(cfg.amount as number) ?? 1}
              onChange={(e) => set({ amount: Math.max(1, Number(e.target.value)) })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.unitLabel")}>
            <select
              value={(cfg.unit as string) ?? "hours"}
              onChange={(e) => set({ unit: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="minutes">{t("config.units.minutes")}</option>
              <option value="hours">{t("config.units.hours")}</option>
              <option value="days">{t("config.units.days")}</option>
            </select>
          </FieldBlock>
        </div>
      )
    case "condition":
      return (
        <>
          <FieldBlock label={t("config.subjectLabel")}>
            <select
              value={(cfg.subject as string) ?? "tag_presence"}
              onChange={(e) => set({ subject: e.target.value })}
              className="w-full rounded-md border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
            >
              <option value="tag_presence">{t("config.subjects.tag_presence")}</option>
              <option value="contact_field">{t("config.subjects.contact_field")}</option>
              <option value="message_content">{t("config.subjects.message_content")}</option>
              <option value="time_of_day">{t("config.subjects.time_of_day")}</option>
            </select>
          </FieldBlock>
          <FieldBlock label={t("config.operandLabel")}>
            <Input
              placeholder={
                cfg.subject === "time_of_day"
                  ? t("config.placeholderTime")
                  : cfg.subject === "contact_field"
                  ? t("config.placeholderContact")
                  : cfg.subject === "tag_presence"
                  ? t("config.placeholderTag")
                  : ""
              }
              value={(cfg.operand as string) ?? ""}
              onChange={(e) => set({ operand: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          {(cfg.subject === "contact_field" || cfg.subject === "message_content") && (
            <FieldBlock label="Value">
              <Input
                value={(cfg.value as string) ?? ""}
                onChange={(e) => set({ value: e.target.value })}
                className="bg-muted text-foreground"
              />
            </FieldBlock>
          )}
        </>
      )
    case "send_webhook":
      return (
        <>
          <FieldBlock label={t("config.urlLabel")}>
            <Input
              value={(cfg.url as string) ?? ""}
              onChange={(e) => set({ url: e.target.value })}
              className="bg-muted text-foreground"
            />
          </FieldBlock>
          <FieldBlock label={t("config.bodyTemplateLabel")}>
            <Textarea
              value={(cfg.body_template as string) ?? ""}
              onChange={(e) => set({ body_template: e.target.value })}
              className="min-h-20 bg-muted font-mono text-xs text-foreground"
            />
          </FieldBlock>
        </>
      )
    case "close_conversation":
      return (
        <p className="text-xs text-muted-foreground">
          {t("config.closeConversationHint", { defaultValue: "Sets the conversation status to \"closed\". No configuration needed." })}
        </p>
      )
    default:
      return null
  }
}

function FieldBlock({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 last:mb-0">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function previewFor(step: BuilderStep): string {
  switch (step.step_type) {
    case "send_message":
      return (step.step_config.text as string) || "no text yet"
    case "send_buttons":
    case "send_list":
      return interactivePayloadPreviewText(asInteractive(step.step_config)) || "no body yet"
    case "send_template":
      return (step.step_config.template_name as string) || "pick a template"
    case "wait":
      return `${step.step_config.amount ?? "?"} ${step.step_config.unit ?? ""}`
    case "condition":
      return `when ${step.step_config.subject ?? "?"}`
    case "send_webhook":
      return (step.step_config.url as string) || "no url"
    default:
      return ""
  }
}

// ------------------------------------------------------------
// Serialize builder tree → API payload (flattened shape)
// ------------------------------------------------------------

interface ApiStep {
  step_type: string
  step_config: Record<string, unknown>
  branches?: { yes?: ApiStep[]; no?: ApiStep[] }
}

export function toApiSteps(steps: BuilderStep[]): ApiStep[] {
  return steps.map((s) => ({
    step_type: s.step_type,
    step_config: s.step_config,
    branches: s.branches
      ? { yes: toApiSteps(s.branches.yes), no: toApiSteps(s.branches.no) }
      : undefined,
  }))
}

/**
 * Convert server-returned step tree (from loadStepsTree) into the
 * builder-local shape with client ids.
 */
export interface ServerStepNode {
  id: string
  step_type: string
  step_config: Record<string, unknown>
  branches: { yes: ServerStepNode[]; no: ServerStepNode[] }
}

export function fromServerSteps(nodes: ServerStepNode[]): BuilderStep[] {
  return nodes.map((n) => ({
    cid: cid(),
    step_type: n.step_type as AutomationStepType,
    step_config: n.step_config ?? {},
    branches:
      n.step_type === "condition"
        ? {
            yes: fromServerSteps(n.branches?.yes ?? []),
            no: fromServerSteps(n.branches?.no ?? []),
          }
        : undefined,
  }))
}
