export type Coach = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export { fmtMoney };
