"use client";

import { usePathname } from "next/navigation";
import { useSettingsContext } from "@/components/settings/SettingsProvider";
import { CgArrowsExpandUpLeft } from "react-icons/cg";
import Text from "@/refresh-components/texts/Text";
import SidebarSection from "@/sections/sidebar/SidebarSection";
import Settings from "@/sections/sidebar/Settings/Settings";
import SidebarWrapper from "@/sections/sidebar/SidebarWrapper";
import { useIsKGExposed } from "@/app/admin/kg/utils";
import { useCustomAnalyticsEnabled } from "@/lib/hooks/useCustomAnalyticsEnabled";
import { useUser } from "@/components/user/UserProvider";
import { useState, memo } from "react";
import { UserRole } from "@/lib/types";
import { MdOutlineCreditCard } from "react-icons/md";
import {
  ClipboardIcon,
  NotebookIconSkeleton,
  PaintingIconSkeleton,
  SlackIconSkeleton,
  BrainIcon,
} from "@/components/icons/icons";
import OnyxLogo from "@/icons/onyx-logo";
import { CombinedSettings } from "@/app/admin/settings/interfaces";
import SidebarTab from "@/refresh-components/buttons/SidebarTab";
import SidebarBody from "@/sections/sidebar/SidebarBody";
import SvgSearch from "@/icons/search";
import SvgShield from "@/icons/shield";
import SvgThumbsUp from "@/icons/thumbs-up";
import SvgUsers from "@/icons/users";
import SvgZoomIn from "@/icons/zoom-in";
import SvgCpu from "@/icons/cpu";
import SvgOnyxOctagon from "@/icons/onyx-octagon";
import SvgGlobe from "@/icons/globe";
import SvgActivity from "@/icons/activity";
import SvgBarChart from "@/icons/bar-chart";
import SvgSettings from "@/icons/settings";
import SvgKey from "@/icons/key";
import SvgUploadCloud from "@/icons/upload-cloud";
import SvgFolder from "@/icons/folder";
import SvgActions from "@/icons/actions";
import SvgUser from "@/icons/user";
import SvgFileText from "@/icons/file-text";
import SvgServer from "@/icons/server";
import useScreenSize from "@/hooks/useScreenSize";
import { cn } from "@/lib/utils";
import { useAdminSidebarContext } from "@/sections/sidebar/AdminSidebarContext";

const connectors_items = () => [
  {
    name: "Existing Connectors",
    icon: NotebookIconSkeleton,
    link: "/admin/indexing/status",
  },
  {
    name: "Add Connector",
    icon: SvgUploadCloud,
    link: "/admin/add-connector",
  },
];

const document_management_items = () => [
  {
    name: "Document Sets",
    icon: SvgFolder,
    link: "/admin/documents/sets",
  },
  {
    name: "Explorer",
    icon: SvgZoomIn,
    link: "/admin/documents/explorer",
  },
  {
    name: "Feedback",
    icon: SvgThumbsUp,
    link: "/admin/documents/feedback",
  },
];

const custom_assistants_items = (
  isCurator: boolean,
  enableEnterprise: boolean,
  isSuperAdmin: boolean
) => {
  const items = [
    {
      name: "Assistants",
      icon: SvgOnyxOctagon,
      link: "/admin/assistants",
    },
  ];

  if (!isCurator) {
    if (isSuperAdmin) {
      items.push({
        name: "Slack Bots",
        icon: SlackIconSkeleton,
        link: "/admin/bots",
      });
    }
    items.push({
      name: "Actions",
      icon: SvgActions,
      link: "/admin/actions",
    });
  } else {
    items.push({
      name: "Actions",
      icon: SvgActions,
      link: "/admin/actions",
    });
  }

  if (enableEnterprise) {
    items.push({
      name: "Standard Answers",
      icon: ClipboardIcon,
      link: "/admin/standard-answer",
    });
  }

  return items;
};

const collections = (
  isCurator: boolean,
  enableCloud: boolean,
  enableEnterprise: boolean,
  settings: CombinedSettings | null,
  kgExposed: boolean,
  customAnalyticsEnabled: boolean,
  userEmail: string | undefined | null
) => {
  const superAdminEmail = process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
  const isSuperAdmin = userEmail === superAdminEmail;
  return [
    {
      name: "Connectors",
      items: connectors_items(),
    },
    {
      name: "Document Management",
      items: document_management_items(),
    },
    {
      name: "Custom Assistants",
      items: custom_assistants_items(isCurator, enableEnterprise, isSuperAdmin),
    },
    ...(isCurator
      ? [
        {
          name: "User Management",
          items: [
            {
              name: "Groups",
              icon: SvgUsers,
              link: "/admin/groups",
            },
          ],
        },
      ]
      : []),
    ...(!isCurator
      ? [
        {
          name: "Configuration",
          items: [
            {
              name: "Default Assistant",
              icon: OnyxLogo,
              link: "/admin/configuration/default-assistant",
            },
            {
              name: "LLM",
              icon: SvgCpu,
              link: "/admin/configuration/llm",
            },
            {
              name: "Web Search",
              icon: SvgGlobe,
              link: "/admin/configuration/web-search",
            },
            ...(!enableCloud
              ? [
                {
                  error: settings?.settings.needs_reindexing,
                  name: "Search Settings",
                  icon: SvgSearch,
                  link: "/admin/configuration/search",
                },
              ]
              : []),
            {
              name: "Document Processing",
              icon: SvgFileText,
              link: "/admin/configuration/document-processing",
            },
            ...(kgExposed
              ? [
                {
                  name: "Knowledge Graph",
                  icon: BrainIcon,
                  link: "/admin/kg",
                },
              ]
              : []),
          ],
        },
        {
          name: "User Management",
          items: [
            {
              name: "Users",
              icon: SvgUser,
              link: "/admin/users",
            },
            ...(enableEnterprise
              ? [
                {
                  name: "Groups",
                  icon: SvgUsers,
                  link: "/admin/groups",
                },
              ]
              : []),
            {
              name: "API Keys",
              icon: SvgKey,
              link: "/admin/api-key",
            },
            {
              name: "Token Rate Limits",
              icon: SvgShield,
              link: "/admin/token-rate-limits",
            },
          ],
        },
        ...(enableEnterprise
          ? [
            {
              name: "Performance",
              items: [
                {
                  name: "Usage Statistics",
                  icon: SvgActivity,
                  link: "/admin/performance/usage",
                },
                ...(settings?.settings.query_history_type !== "disabled"
                  ? [
                    {
                      name: "Query History",
                      icon: SvgServer,
                      link: "/admin/performance/query-history",
                    },
                  ]
                  : []),
                ...(!enableCloud && customAnalyticsEnabled
                  ? [
                    {
                      name: "Custom Analytics",
                      icon: SvgBarChart,
                      link: "/admin/performance/custom-analytics",
                    },
                  ]
                  : []),
              ],
            },
          ]
          : []),
        {
          name: "Settings",
          items: [
            {
              name: "Workspace Settings",
              icon: SvgSettings,
              link: "/admin/settings",
            },
            ...(enableEnterprise
              ? [
                {
                  name: "Whitelabeling",
                  icon: PaintingIconSkeleton,
                  link: "/admin/whitelabeling",
                },
              ]
              : []),
            ...(enableCloud
              ? [
                {
                  name: "Billing",
                  icon: MdOutlineCreditCard,
                  link: "/admin/billing",
                },
              ]
              : []),
          ],
        },
      ]
      : []),
  ];
};

interface AdminSidebarInnerProps {
  folded: boolean;
  onFoldClick: () => void;
  enableCloudSS: boolean;
  enableEnterpriseSS: boolean;
}

function AdminSidebarInner({
  folded,
  onFoldClick,
  enableCloudSS,
  enableEnterpriseSS,
}: AdminSidebarInnerProps) {
  const { kgExposed } = useIsKGExposed();
  const pathname = usePathname();
  const { customAnalyticsEnabled } = useCustomAnalyticsEnabled();
  const { user } = useUser();
  const settings = useSettingsContext();

  const isCurator =
    user?.role === UserRole.CURATOR || user?.role === UserRole.GLOBAL_CURATOR;

  const items = collections(
    isCurator,
    enableCloudSS,
    enableEnterpriseSS,
    settings,
    kgExposed,
    customAnalyticsEnabled,
    user?.email
  );

  return (
    <SidebarWrapper folded={folded} onFoldClick={onFoldClick}>
      <SidebarBody
        actionButton={
          <SidebarTab
            leftIcon={({ className }) => (
              <CgArrowsExpandUpLeft className={className} size={16} />
            )}
            href="/chat"
            folded={folded}
          >
            Exit Admin
          </SidebarTab>
        }
        footer={
          <div className="flex flex-col gap-2">
            {!folded && settings.webVersion && (
              <Text text02 secondaryBody className="px-2">
                {`Cellilox version: ${settings.webVersion}`}
              </Text>
            )}
            <Settings folded={folded} />
          </div>
        }
      >
        {items.map((collection, index) => (
          <SidebarSection key={index} title={collection.name} folded={folded}>
            <div className="flex flex-col w-full">
              {collection.items.map(({ link, icon: Icon, name }, index) => (
                <SidebarTab
                  key={index}
                  href={link}
                  active={pathname.startsWith(link)}
                  leftIcon={({ className }) => (
                    <Icon className={className} size={16} />
                  )}
                  folded={folded}
                >
                  {name}
                </SidebarTab>
              ))}
            </div>
          </SidebarSection>
        ))}
      </SidebarBody>
    </SidebarWrapper>
  );
}

const MemoizedAdminSidebarInner = memo(AdminSidebarInner);
MemoizedAdminSidebarInner.displayName = "AdminSidebar";

interface AdminSidebarProps {
  enableCloudSS: boolean;
  enableEnterpriseSS: boolean;
}

export default function AdminSidebar({
  enableCloudSS,
  enableEnterpriseSS,
}: AdminSidebarProps) {
  const { folded, setFolded } = useAdminSidebarContext();
  const { isMobile } = useScreenSize();

  if (!isMobile)
    return (
      <MemoizedAdminSidebarInner
        folded={folded}
        onFoldClick={() => setFolded((prev) => !prev)}
        enableCloudSS={enableCloudSS}
        enableEnterpriseSS={enableEnterpriseSS}
      />
    );

  return (
    <>
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200",
          folded ? "-translate-x-full" : "translate-x-0"
        )}
      >
        <MemoizedAdminSidebarInner
          folded={false}
          onFoldClick={() => setFolded(true)}
          enableCloudSS={enableCloudSS}
          enableEnterpriseSS={enableEnterpriseSS}
        />
      </div>

      {/* Hitbox to close the sidebar if anything outside of it is touched */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-mask-03 backdrop-blur-03 transition-opacity duration-200",
          folded
            ? "opacity-0 pointer-events-none"
            : "opacity-100 pointer-events-auto"
        )}
        onClick={() => setFolded(true)}
      />
    </>
  );
}
