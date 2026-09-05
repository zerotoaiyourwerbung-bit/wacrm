"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  Bell,
  Bot,
  Crown,
  GitBranch,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Radio,
  Settings,
  Shield,
  User,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";

// Per-role chip metadata used in the sidebar's account strip + the
// Members tab roster. Keeping this near both consumers in a single
// place avoids drift between the two surfaces — when a designer
// wants to recolour "agent" rows, this is the one diff.
const ROLE_CHIP: Record<
  AccountRole,
  { icon: typeof Crown; labelKey: string; className: string }
> = {
  owner: {
    icon: Crown,
    labelKey: "roleOwner",
    // Amber: scarce, immutable, "the boss" — gets visual emphasis.
    className:
      "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  admin: {
    icon: Shield,
    labelKey: "roleAdmin",
    // Primary-tinted: significant but not as scarce as owner.
    className:
      "border-primary/40 bg-primary/10 text-primary",
  },
  agent: {
    icon: UserCog,
    labelKey: "roleAgent",
    // Neutral slate: the operational default.
    className:
      "border-border bg-muted text-foreground",
  },
  viewer: {
    icon: User,
    labelKey: "roleViewer",
    // Muted slate: read-only role; visually quieter than agent.
    className:
      "border-border bg-card text-muted-foreground",
  },
};
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
  beta?: boolean;
}

const mainNavItems: NavItem[] = [
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/inbox", labelKey: "inbox", icon: MessageSquare },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
  { href: "/broadcasts", labelKey: "broadcasts", icon: Radio },
];

const secondaryNavItems: NavItem[] = [
  { href: "/automations", labelKey: "automations", icon: Zap },
  { href: "/flows", labelKey: "flows", icon: Workflow, beta: true },
  { href: "/agents", labelKey: "aiAgents", icon: Bot },
  { href: "/notifications", labelKey: "notifications", icon: Bell },
];

const accountNavItems: NavItem[] = [
  { href: "/settings", labelKey: "settings", icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

import { useTranslations } from "next-intl";

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const { profile, profileLoading, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();
  const showAccountStrip =
    !profileLoading &&
    !!account?.name &&
    account.name !== profile?.full_name;

  useEffect(() => {
    onClose?.();
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const renderNavList = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));

        const showUnreadDot =
          item.href === "/inbox" && totalUnread > 0;

        const showNotificationBadge =
          item.href === "/notifications" && unreadNotifications > 0;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-[#18453B] text-white shadow-inner"
                  : "text-[#8FA8A0] hover:bg-[#143B31] hover:text-white",
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  isActive ? "text-emerald-400" : "text-[#8FA8A0]",
                )}
              />
              <span className="flex-1 truncate">{t(item.labelKey as string)}</span>

              {item.beta && (
                <span
                  aria-label={t("beta")}
                  className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300"
                >
                  {t("beta")}
                </span>
              )}

              {showUnreadDot && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1F4E42] px-1.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}

              {showNotificationBadge && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1F4E42] px-1.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/30">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}

              {isActive && (
                <span
                  className="absolute right-2.5 h-4 w-1 rounded-full bg-[#10B981]"
                  aria-hidden
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <button
        type="button"
        aria-label={t("closeMenu")}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/50 backdrop-blur-xs transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-64 flex-col border-r border-[#153C33] bg-[#0C2B24] text-white",
          "transition-transform duration-200 ease-out will-change-transform",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:w-64 lg:translate-x-0 lg:transition-none",
        )}
        aria-label="Primary"
      >
        {/* Brand header */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[#153C33] px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-400">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-bold tracking-tight text-white">
                Zero To AI
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8FA8A0] hover:bg-[#143B31] hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search Bar matching reference image */}
        <div className="px-3 pt-3">
          <div className="flex items-center justify-between w-full h-9 rounded-lg bg-[#143B31] border border-[#1C4E42] px-3 text-xs text-[#8FA8A0] cursor-pointer hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-[#8FA8A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Search</span>
            </div>
            <span className="bg-[#0C2B24] border border-[#235347] px-1.5 py-0.5 rounded text-[10px] text-[#8FA8A0] font-mono">
              ⌘ F
            </span>
          </div>
        </div>

        {/* Main navigation with categories */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B8D83]">
              Main Menu
            </p>
            {renderNavList(mainNavItems)}
          </div>

          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B8D83]">
              Other
            </p>
            {renderNavList(secondaryNavItems)}
          </div>

          <div>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#6B8D83]">
              Account
            </p>
            {renderNavList(accountNavItems)}
          </div>
        </nav>

        {/* User section matching reference */}
        <div className="shrink-0 border-t border-[#153C33] p-3">
          {showAccountStrip && account?.name && (
            <div className="mb-2 flex items-center gap-2 px-2 text-xs text-[#8FA8A0]">
              <UsersRound className="size-3.5 shrink-0" />
              <span className="truncate text-xs" title={account.name}>
                {account.name}
              </span>
              {accountRole && (
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9px] font-medium text-emerald-300">
                  {accountRole}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-[#143B31] border border-[#1E4D42] p-2 transition-colors">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none">
                <Avatar className="size-8 shrink-0 rounded-lg">
                  {profile?.avatar_url ? (
                    <AvatarImage
                      src={profile.avatar_url}
                      alt={profile.full_name ?? t("defaultAvatar")}
                    />
                  ) : null}
                  <AvatarFallback className="bg-emerald-600/30 text-xs font-semibold text-emerald-300 rounded-lg">
                    {profile?.full_name?.charAt(0)?.toUpperCase() ??
                      profile?.email?.charAt(0)?.toUpperCase() ??
                      "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    {profile?.full_name ?? t("defaultUser")}
                  </p>
                  <p className="truncate text-[10px] text-[#8FA8A0]">
                    {profile?.email ?? ""}
                  </p>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={6}
                className="min-w-56 bg-[#0F332A] text-white border border-[#1E4D42] rounded-lg"
              >
                <DropdownMenuItem
                  render={
                    <Link
                      href="/settings?tab=profile"
                      onClick={onClose}
                      className="text-white hover:bg-[#18453B] focus:bg-[#18453B]"
                    />
                  }
                >
                  <User className="size-4 text-[#8FA8A0]" />
                  {t("menuProfile")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      href="/settings?tab=whatsapp"
                      onClick={onClose}
                      className="text-white hover:bg-[#18453B] focus:bg-[#18453B]"
                    />
                  }
                >
                  <Settings className="size-4 text-[#8FA8A0]" />
                  {t("menuSettings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#1E4D42]" />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-red-300 hover:bg-red-500/10 focus:bg-red-500/10"
                >
                  <LogOut className="size-4 text-red-300" />
                  {t("menuSignOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={signOut}
              title={t("menuSignOut")}
              aria-label={t("menuSignOut")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#8FA8A0] hover:bg-[#1E4D42] hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
