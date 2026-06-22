import { config } from './config';
export function receiptUrl(id: string) { return `${config.guardBaseUrl}/receipts/${id}`; }
export function badgeUrl(id: string) { return `${config.guardBaseUrl}/api/receipts/${id}/badge`; }
export function badgeSvg(label: string, color: string) { return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="28" role="img" aria-label="MAMV ${label}"><rect width="180" height="28" rx="6" fill="#111827"/><rect x="72" width="108" height="28" rx="6" fill="${color}"/><text x="12" y="18" fill="#fff" font-family="Verdana" font-size="11">MAMV</text><text x="86" y="18" fill="#fff" font-family="Verdana" font-size="11">${label}</text></svg>`; }
