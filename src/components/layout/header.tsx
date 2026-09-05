"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  Bell,
  Download,
  Info,
  LogOut,
  Menu,
  Plus,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
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
import { useTranslations } from "next-intl";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "dashboard";
}

interface HeaderProps {
  onOpenSidebar?: () => void;
}

export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const titleKey = getPageTitleKey(pathname);

  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  const firstName = profile?.full_name
    ? profile.full_name.split(" ")[0]
    : "there";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#E4E9E6] bg-[#F4F7F5] px-4 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openMenu")}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-900 lg:hidden shadow-2xs border border-[#E4E9E6]"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex flex-col">
          <h1 className="truncate text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
            {t(titleKey as string)}
          </h1>
          <p className="text-[11px] text-gray-500 font-medium">
            Welcome back, {firstName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Info & Notifications */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            title="Help & Info"
            className="flex size-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition-colors"
          >
            <Info className="size-4" />
          </button>
          <Link
            href="/notifications"
            title="Notifications"
            className="relative flex size-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition-colors"
          >
            <Bell className="size-4" />
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-[#F4F7F5]" />
          </Link>
        </div>

        {/* Primary Export Button */}
        <button
          type="button"
          onClick={() => {
            window.print();
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#0F332A] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#164237] transition-colors"
        >
          <Download className="size-3.5" />
          <span>Export</span>
        </button>

        {/* User profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-lg p-1 transition-colors hover:bg-white focus:outline-none"
            aria-label={t("openAccountMenu")}
          >
            <Avatar className="size-8 rounded-lg ring-1 ring-[#E4E9E6]">
              {profile?.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={profile.full_name ?? t("defaultAvatar")}
                />
              ) : null}
              <AvatarFallback className="bg-emerald-50 text-xs font-bold text-emerald-800 rounded-lg">
                {initial}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="min-w-56 bg-white text-gray-800 border border-[#E4E9E6] shadow-lg rounded-xl p-1.5"
          >
            <div className="px-3 py-2">
              <p className="truncate text-xs font-bold text-gray-900">
                {profile?.full_name ?? t("defaultUser")}
              </p>
              <p className="truncate text-[11px] text-gray-500">
                {profile?.email ?? ""}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-gray-100" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:bg-gray-50"
                />
              }
            >
              <User className="size-3.5 mr-2 text-gray-500" />
              {t("menuProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=whatsapp"
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:bg-gray-50"
                />
              }
            >
              <SettingsIcon className="size-3.5 mr-2 text-gray-500" />
              {t("menuSettings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-100" />
            <DropdownMenuItem
              onClick={signOut}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 focus:bg-red-50"
            >
              <LogOut className="size-3.5 mr-2 text-red-500" />
              {t("menuSignOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
