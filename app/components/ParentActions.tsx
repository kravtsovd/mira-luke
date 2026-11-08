"use client";

import { BarChart3 } from "lucide-react";
import { Account } from "./useAccount";

const displayName = (account: Account) => account.userName?.split(" ")[0] || account.email?.split("@")[0] || "Родитель";

export function AccountBadge({ account, onOpen, testId = "account-badge" }: { account: Account; onOpen: () => void; testId?: string }) {
  if (!account.signedIn) return null;
  const name = displayName(account);
  return <button type="button" className="account-badge" onClick={onOpen} data-testid={testId}
    title={`Вы вошли как ${account.email ?? name}`} aria-label={`Вы вошли как ${account.email ?? name}. Открыть настройки семьи`}>
    <span className="account-initial" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
    <span className="account-copy"><small>Вы вошли</small><strong>{name}</strong></span>
  </button>;
}

export function StatsButton({ onOpen, href, onFollow, testId = "stats-open" }: { onOpen: () => void; href?: string; onFollow?: () => void; testId?: string }) {
  if (href) return <a className="stats-button" href={href} target="_blank" rel="noopener" onClick={onFollow} data-testid={testId} aria-label="Статистика детей (откроется в новой вкладке)">
    <BarChart3 aria-hidden="true" /><span>Статистика</span>
  </a>;
  return <button type="button" className="stats-button" onClick={onOpen} data-testid={testId} aria-label="Статистика детей">
    <BarChart3 aria-hidden="true" /><span>Статистика</span>
  </button>;
}
