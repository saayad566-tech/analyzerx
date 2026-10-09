import { fetchNseUniverse } from "../server/nse-universe";

async function main() {
  const snapshot = await fetchNseUniverse();
  console.log(JSON.stringify({ count: snapshot.securities.length, errors: snapshot.errors, first: snapshot.securities[0] ?? null, last: snapshot.securities.at(-1) ?? null }, null, 2));
  if (!snapshot.securities.length) process.exitCode = 2;
}

void main();
