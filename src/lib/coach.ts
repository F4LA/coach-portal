export type Coach = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

// Coach Pay is always a whole dollar amount, but Retention Commission can carry
// real cents (e.g. $46.15) — only hide the ".00" when there's nothing there.
const fmtMoney = (cents: number) => {
  const hasCents = Math.round(cents) % 100 !== 0;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
};

export { fmtMoney };
