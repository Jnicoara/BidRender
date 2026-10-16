/** Sizes and the local sign-in for the stress data (scripts/stressSeed.mts). Its own module so the timers can import it without running the seeder. */
export const STRESS = {
  /** The busy company. */
  ownerEmail: "stress-c@example.com",
  password: "Stress-C-local-1!",
  bids: 150,
  sheetsPerBid: 6,
  /** The three huge bids inside it. */
  bigBids: 3,
  bigSheets: 60,
  bigMarks: 2500,
  bigGroups: 20,
  bigRuns: 40,
  /** The other companies, using the app at the same time. */
  others: 10,
  otherBids: 10,
} as const;
