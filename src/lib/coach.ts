export type Coach = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

// All payments in this business are whole dollars — never show cents.
const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

export { fmtMoney };
