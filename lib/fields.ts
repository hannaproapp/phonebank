// Picklist values must match the GHL Canvassing object dropdowns character for character.

export const DISPOSITIONS = [
  "Voter Contacted",
  "No Answer",
  "Voicemail Left",
  "Refused",
  "Hung Up",
  "Wrong Number",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const CANDIDATE_AWARENESS = [
  "Knows Candidate",
  "Heard of Candidate",
  "Unaware of Candidate",
] as const;

export const SUPPORT_LEVEL = [
  "1-Strong Supporter",
  "2-Lean Supporter",
  "3-Undecided",
  "4-Lean Opposition",
  "5-Strong Opposition",
] as const;

export const VOTE_PLAN = [
  "Election Day",
  "Early Vote",
  "Mail Ballot",
  "Not Sure",
  "Won't Commit",
] as const;

export const PHONE_CORRECT = ["Correct", "Incorrect"] as const;

// Only "Voter Contacted" opens the full canvass form.
export const CONTACTED: Disposition = "Voter Contacted";

export const CANVASSING_FOR = ["Primary", "General", "Special"] as const;
