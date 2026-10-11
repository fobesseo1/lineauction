// Rights/risk warnings shown next to a property's discount (lineestate risk badge).
// Read from the court 비고 text or the Onbid 유의사항/부대조건/기타 text. A mention is a
// "check before bidding" warning, not a legal conclusion, so any mention raises the flag.
export const RISK_PATTERNS=[
 ['지분매각',/지분\s*매각|지분\s*경매|공유자\s*(?:의\s*)?우선\s*매수/],
 ['유치권',/유치권/],
 ['법정지상권',/법정\s*지상권/],
 ['위반건축물',/위반\s*건축/],
 ['대지권미등기',/대지권\s*(?:미\s*등기|없음)/],
 ['토지별도등기',/토지\s*별도\s*등기/],
 ['선순위',/선순위\s*(?:임차인|임차권|전세권|가처분|가등기|지상권|근저당)|대항력\s*(?:있는|있음|이\s*있는)/],
];
export function riskFlags(...texts){
 const text=texts.filter(Boolean).join('\n');
 return RISK_PATTERNS.filter(([,re])=>re.test(text)).map(([flag])=>flag);
}
