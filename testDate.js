const cellValue = "44033";
const asNumber = Number(cellValue);
let d;
if (!isNaN(asNumber) && asNumber > 30000 && asNumber < 60000) {
  const date = new Date((asNumber - 25569) * 86400 * 1000);
  d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
console.log(d.toISOString());
