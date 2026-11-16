import {
  Activity,
  Binoculars,
  FlaskConical,
  ScanSearch,
  LayoutDashboard,
  Swords,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  blurb: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", short: "Home", icon: LayoutDashboard, blurb: "Pressure performance at a glance" },
  { href: "/leaderboards/", label: "Leaderboards", short: "Ranks", icon: Trophy, blurb: "Top 10 by Pressure Rating" },
  { href: "/player/", label: "Player Profile", short: "Player", icon: UserRound, blurb: "Normal vs pressure, feature by feature" },
  { href: "/evidence/", label: "Pressure Proof", short: "Proof", icon: ScanSearch, blurb: "The matches behind every top-10 rating" },
  { href: "/replay/", label: "Match Replay", short: "Replay", icon: Activity, blurb: "Ball-by-ball win probability and pressure" },
  { href: "/matchups/", label: "Matchup Arena", short: "Arena", icon: Swords, blurb: "Bowlers vs elite batter tiers" },
  { href: "/scouting/", label: "Scouting Room", short: "Scout", icon: Binoculars, blurb: "Fix plans and attack plans" },
  { href: "/method/", label: "Method", short: "Method", icon: FlaskConical, blurb: "How the Pressure Rating is built" },
];
