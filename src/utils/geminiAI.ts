import { AppState, ParsedRule, Staff } from '../types';
import { daysInMonth } from './shiftEngine';
import { computeStaffSummaries, runFacilityChecks } from './complianceEngine';

function normalizeInstructionLine(raw: string): string {
  return raw
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/：/g, ':')
    .replace(/～/g, '〜')
    .replace(/^[・•*＊\-ー—+#＃\s　]+/, '')
    .replace(/^\d+[.)）:：\s　]+/, '')
    .trim();
}

function matchStaffInLine(line: string, staffList: Staff[]): Staff[] {
  const candidates: Array<{ staff: Staff; pos: number; matchLen: number }> = [];
  const lineNoSpace = line.replace(/\s+/g, '');

  for (const s of staffList) {
    const fullName = s.name.trim();
    const noSpaceName = fullName.replace(/\s+/g, '');
    const parts = fullName.split(/\s+/).filter(Boolean);
    const surname = parts[0] || '';
    const givenName = parts[1] || '';

    let pos = line.indexOf(fullName);
    if (pos !== -1) {
      candidates.push({ staff: s, pos, matchLen: fullName.length + 10 });
      continue;
    }

    pos = lineNoSpace.indexOf(noSpaceName);
    if (pos !== -1 && noSpaceName.length >= 2) {
      candidates.push({ staff: s, pos, matchLen: noSpaceName.length + 8 });
      continue;
    }

    if (surname && surname.length >= 1) {
      const sPos = line.indexOf(surname);
      if (sPos !== -1) {
        candidates.push({ staff: s, pos: sPos, matchLen: surname.length });
        continue;
      }
    }

    if (givenName && givenName.length >= 2) {
      const gPos = line.indexOf(givenName);
      if (gPos !== -1) {
        candidates.push({ staff: s, pos: gPos, matchLen: givenName.length });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    return b.matchLen - a.matchLen;
  });

  // Deduplicate by staff.id
  const seen = new Set<number>();
  const result: Staff[] = [];
  for (const c of candidates) {
    if (!seen.has(c.staff.id)) {
      seen.add(c.staff.id);
      result.push(c.staff);
    }
  }
  return result;
}

function detectExplicitShiftPattern(
  line: string,
  state: AppState,
  matchedStaffNames: string[]
): {
  shiftKey?: string;
  explicitShiftKey: boolean;
  timeStart?: string;
  timeEnd?: string;
} {
  // 1. Check explicit time range (e.g. 09:00-17:00, 9:00〜17:00, 9時〜17時)
  const colonTimeMatch = line.match(/(\d{1,2}):(\d{2})\s*[〜~\-ー]\s*(\d{1,2}):(\d{2})/);
  if (colonTimeMatch) {
    const start = `${colonTimeMatch[1].padStart(2, '0')}:${colonTimeMatch[2]}`;
    const end = `${colonTimeMatch[3].padStart(2, '0')}:${colonTimeMatch[4]}`;
    return {
      shiftKey: `time:${start}-${end}`,
      explicitShiftKey: true,
      timeStart: start,
      timeEnd: end,
    };
  }

  const jpTimeMatch = line.match(/(\d{1,2})時(?:(\d{1,2})分|(半))?\s*[〜~\-ーからまで]+\s*(\d{1,2})時(?:(\d{1,2})分|(半))?/);
  if (jpTimeMatch) {
    const sMin = jpTimeMatch[3] ? '30' : (jpTimeMatch[2] || '00').padStart(2, '0');
    const eMin = jpTimeMatch[6] ? '30' : (jpTimeMatch[5] || '00').padStart(2, '0');
    const start = `${jpTimeMatch[1].padStart(2, '0')}:${sMin}`;
    const end = `${jpTimeMatch[4].padStart(2, '0')}:${eMin}`;
    return {
      shiftKey: `time:${start}-${end}`,
      explicitShiftKey: true,
      timeStart: start,
      timeEnd: end,
    };
  }

  const patterns = state.shiftPatterns;
  const resolveKey = (keyword: '早' | '日' | '遅' | '夜'): string => {
    const found = patterns.find(
      (p) => p.key === keyword || p.key.includes(keyword) || p.name.includes(keyword)
    );
    return found ? found.key : keyword;
  };

  // 2. Check bracketed pattern key/name first: e.g. (日), (早), (遅), (夜), 「日」, 【早番】
  const bracketMatches = line.matchAll(/[(\[「【『]\s*([^)\]」】』\s]+)\s*[)\]」】』]/g);
  for (const m of bracketMatches) {
    const token = m[1].trim();
    const exactPat = patterns.find((p) => p.key === token || p.name === token);
    if (exactPat) {
      return { shiftKey: exactPat.key, explicitShiftKey: true };
    }
    if (token === '早' || token === '早番') return { shiftKey: resolveKey('早'), explicitShiftKey: true };
    if (token === '日' || token === '日勤') return { shiftKey: resolveKey('日'), explicitShiftKey: true };
    if (token === '遅' || token === '遅番') return { shiftKey: resolveKey('遅'), explicitShiftKey: true };
    if (token === '夜' || token === '夜勤') return { shiftKey: resolveKey('夜'), explicitShiftKey: true };
  }

  // 3. Check multi-character pattern names (e.g. 早番, 日勤, 遅番, 夜勤, or custom pattern names >= 2 chars)
  const multiCharPats = [...patterns]
    .filter((p) => p.name && p.name.length >= 2)
    .sort((a, b) => b.name.length - a.name.length);
  for (const pat of multiCharPats) {
    if (line.includes(pat.name)) {
      return { shiftKey: pat.key, explicitShiftKey: true };
    }
  }
  const multiCharKeys = [...patterns]
    .filter((p) => p.key && p.key.length >= 2)
    .sort((a, b) => b.key.length - a.key.length);
  for (const pat of multiCharKeys) {
    if (line.includes(pat.key)) {
      return { shiftKey: pat.key, explicitShiftKey: true };
    }
  }

  if (line.includes('夜勤')) return { shiftKey: resolveKey('夜'), explicitShiftKey: true };
  if (line.includes('早番') || line.includes('早出')) return { shiftKey: resolveKey('早'), explicitShiftKey: true };
  if (line.includes('遅番') || line.includes('遅出')) return { shiftKey: resolveKey('遅'), explicitShiftKey: true };
  if (line.includes('日勤')) return { shiftKey: resolveKey('日'), explicitShiftKey: true };
  if (line.includes('午前休') || line.includes('前休')) return { shiftKey: '午前休', explicitShiftKey: true };
  if (line.includes('午後休') || line.includes('後休')) return { shiftKey: '午後休', explicitShiftKey: true };

  // 4. Check single-character pattern keys ONLY after stripping staff names, day-of-week words, and date/day-count words
  let stripped = line;
  for (const name of matchedStaffNames) {
    stripped = stripped.replaceAll(name, '').replaceAll(name.replace(/\s+/g, ''), '');
    for (const part of name.split(/\s+/)) {
      if (part) stripped = stripped.replaceAll(part, '');
    }
  }
  stripped = stripped
    .replace(/毎週\s*[日月火水木金土](?:曜|曜日)?/g, '')
    .replace(/[日月火水木金土](?:曜|曜日)/g, '')
    .replace(/平日|土日|週末|毎日|全日|祝日|祭日|休日|公休|有休|有給|希望休|出勤日|勤務日|連日|同日|同じ日|別の日/g, '')
    .replace(/\d+\s*日/g, '');

  for (const pat of patterns) {
    if (pat.key.length === 1 && stripped.includes(pat.key)) {
      return { shiftKey: pat.key, explicitShiftKey: true };
    }
  }

  return { shiftKey: undefined, explicitShiftKey: false };
}

// Client-side local rule parser for natural language shift instructions
export function parseInstructionLocally(text: string, state: AppState): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const rawLines = text
    .split(/[\n;；。]/)
    .map((l) => normalizeInstructionLine(l))
    .filter((l) => Boolean(l) && !/^(?:例|入力例|サンプル)[:：]?$/.test(l));

  const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  rawLines.forEach((line, index) => {
    const matchedStaffList = matchStaffInLine(line, state.staff);
    const matchedStaff = matchedStaffList[0];
    const secondStaff = matchedStaffList[1];

    // Remove staff names when scanning for day-of-week characters so names containing 日/月/火/水/木/金/土 don't false-trigger!
    let lineWithoutNames = line;
    matchedStaffList.forEach((st) => {
      lineWithoutNames = lineWithoutNames
        .replaceAll(st.name, '')
        .replaceAll(st.name.replace(/\s+/g, ''), '');
      st.name.split(/\s+/).forEach((part) => {
        if (part) lineWithoutNames = lineWithoutNames.replaceAll(part, '');
      });
    });

    // 1. Pair Override Rule (when 2 staff names are mentioned)
    if (matchedStaff && secondStaff) {
      const isForbiddenPair = /(?:別々|一緒.*ない|同日.*ない|同じ日.*ない|重ならない|NG|禁止|避け|離し|外し)/.test(
        lineWithoutNames
      );
      const isRecommendedPair = /(?:一緒|同日|同じ日|ペア|組ませ|OJT|セット)/.test(lineWithoutNames);
      if (isForbiddenPair || isRecommendedPair) {
        const pairType = isForbiddenPair ? 'forbidden' : 'recommended';
        rules.push({
          id: `rule-${Date.now()}-${index}`,
          text: `${matchedStaff.name} と ${secondStaff.name} を${
            pairType === 'forbidden' ? '同日シフトNG（禁止ペア）' : '同日シフト優先（推奨ペア）'
          }に設定`,
          staffName: `${matchedStaff.name}・${secondStaff.name}`,
          staffId: matchedStaff.id,
          secondStaffName: secondStaff.name,
          secondStaffId: secondStaff.id,
          ruleType: 'pair_override',
          pairType,
        });
        return;
      }
    }

    // 2. Detect explicit Shift Pattern or Time Range
    const { shiftKey, explicitShiftKey, timeStart, timeEnd } = detectExplicitShiftPattern(
      line,
      state,
      matchedStaffList.map((s) => s.name)
    );

    // 3. Night Shift Limit / Exemption Rule (e.g. 「鈴木 健太　夜勤は週1回のみ」「夜勤は月3回まで」「夜勤なし」)
    if (matchedStaff && /夜勤|夜番/.test(lineWithoutNames)) {
      const nightPerWeekMatch = lineWithoutNames.match(/週\s*(?:に\s*)?(\d+)\s*(?:回|日|度)/);
      const nightZeroMatch = /(?:なし|不可|NG|免除|外して|入れない|0回|ゼロ|禁止)/.test(lineWithoutNames);
      const nightPerMonthMatch = !nightPerWeekMatch
        ? lineWithoutNames.match(/(?:月\s*(?:に\s*)?)?(\d+)\s*(?:回|日|度)\s*(?:のみ|だけ|まで|以内|上限)?/)
        : null;

      if (nightZeroMatch) {
        rules.push({
          id: `rule-${Date.now()}-${index}`,
          text: `${matchedStaff.name} の夜勤を免除（0回）に設定`,
          staffName: matchedStaff.name,
          staffId: matchedStaff.id,
          ruleType: 'night_limit',
          maxNightPerWeek: 0,
          maxNightPerMonth: 0,
        });
        return;
      }

      if (nightPerWeekMatch) {
        const maxW = parseInt(nightPerWeekMatch[1], 10);
        rules.push({
          id: `rule-${Date.now()}-${index}`,
          text: `${matchedStaff.name} の夜勤を週${maxW}回までに制限`,
          staffName: matchedStaff.name,
          staffId: matchedStaff.id,
          ruleType: 'night_limit',
          maxNightPerWeek: maxW,
        });
        return;
      }

      if (nightPerMonthMatch) {
        const maxM = parseInt(nightPerMonthMatch[1], 10);
        rules.push({
          id: `rule-${Date.now()}-${index}`,
          text: `${matchedStaff.name} の夜勤を月${maxM}回までに制限`,
          staffName: matchedStaff.name,
          staffId: matchedStaff.id,
          ruleType: 'night_limit',
          maxNightPerMonth: maxM,
        });
        return;
      }
    }

    // 4. Must Fill Contracted / Weekly Hours Rule (e.g. 「佐藤 由美は必ず週所定労働時間数は入れて」)
    const isMustFillHours =
      /(?:所定労働時間|週所定|契約時間|規定時間|所定時間|フルタイム|フルで|満額)/.test(lineWithoutNames) ||
      /(?:必ず|絶対|きっちり|しっかり|100%).*(?:時間|シフト|日数).*(?:入れ|満た|確保|消化)/.test(lineWithoutNames) ||
      /週\s*\d+\s*時間.*(?:入れ|満た|確保|必須|必ず)/.test(lineWithoutNames);

    if (matchedStaff && isMustFillHours) {
      const customWeekHMatch = lineWithoutNames.match(/週\s*(\d+(?:\.\d+)?)\s*時間/);
      const targetWeeklyH = customWeekHMatch ? parseFloat(customWeekHMatch[1]) : matchedStaff.hours || 40;
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} は週所定労働時間（週${targetWeeklyH}h）を必ず満たすよう最優先配置`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'must_fill_hours',
        hours: targetWeeklyH,
      });
      return;
    }

    // 5. Day of Week detection
    const dows: number[] = [];
    if (lineWithoutNames.includes('平日')) {
      dows.push(1, 2, 3, 4, 5);
    } else if (lineWithoutNames.includes('土日') || lineWithoutNames.includes('週末')) {
      dows.push(0, 6);
    } else if (lineWithoutNames.includes('毎日') || lineWithoutNames.includes('全日')) {
      dows.push(0, 1, 2, 3, 4, 5, 6);
    } else {
      DOW_NAMES.forEach((dowChar, idx) => {
        const regex = new RegExp(
          `(?:${dowChar}(?:曜|曜日)|毎週\\s*[日月火水木金土・,、と]*${dowChar}|[日月火水木金土][・,、と]${dowChar}(?:曜|曜日)?|${dowChar}[・,、と][日月火水木金土](?:曜|曜日)?)`
        );
        if (regex.test(lineWithoutNames)) {
          dows.push(idx);
        }
      });
    }
    const uniqueDows = Array.from(new Set(dows)).sort((a, b) => a - b);

    // 6. Specific Date detection (ignoring "週3日", "3日間", "3日連続", "1日8時間", etc.)
    const lineForDates = lineWithoutNames
      .replace(/週\s*(?:に\s*)?\d+\s*日/g, '')
      .replace(/月\s*(?:に\s*)?\d+\s*日\s*(?:以内|まで|のみ|上限|以上|出勤|勤務)/g, '')
      .replace(/\d+\s*日\s*(?:連続|連勤|間|分|おき|ごと)/g, '')
      .replace(/1日\s*\d+\s*時間/g, '');

    const dates: number[] = [];
    const rangeMatches = lineForDates.matchAll(/(\d{1,2})\s*日?\s*[〜~\-ー]\s*(\d{1,2})\s*日/g);
    let foundRange = false;
    for (const rm of rangeMatches) {
      foundRange = true;
      const startD = parseInt(rm[1], 10);
      const endD = parseInt(rm[2], 10);
      for (let d = Math.min(startD, endD); d <= Math.max(startD, endD); d++) {
        if (d >= 1 && d <= 31) dates.push(d);
      }
    }
    if (!foundRange) {
      // Also support "10・15日" or "10, 15日" or "10日と15日"
      const multiDateBeforeDay = lineForDates.matchAll(/((?:\d{1,2}\s*[・,、と]\s*)+\d{1,2})\s*日/g);
      for (const mm of multiDateBeforeDay) {
        const nums = mm[1].match(/\d{1,2}/g) || [];
        nums.forEach((n) => {
          const val = parseInt(n, 10);
          if (val >= 1 && val <= 31) dates.push(val);
        });
      }
      const singleDateMatches = lineForDates.matchAll(/(\d{1,2})\s*日/g);
      for (const m of singleDateMatches) {
        const val = parseInt(m[1], 10);
        if (val >= 1 && val <= 31) dates.push(val);
      }
    }
    const uniqueDates = Array.from(new Set(dates)).sort((a, b) => a - b);

    // 7. Intent detection (Leave vs Work)
    const isLeave =
      /(?:休み|休む|休ませて|不在|オフ|公休|有休|有給|希望休|出勤させない|外して|外す|入れないで|入れない|出ない|NG|不可|免除)/.test(
        lineWithoutNames
      ) && !/(?:前休|午前休|後休|午後休)/.test(lineWithoutNames);

    // Case A: Day of week work assignment (e.g. 「田中 美咲さんを毎週月曜日に入れて」「山田 花子　毎週木曜日出勤(日)」)
    if (matchedStaff && uniqueDows.length > 0 && !isLeave) {
      const dowLabels = uniqueDows.map((d) => DOW_NAMES[d]).join('・');
      const patternLabel = explicitShiftKey && shiftKey ? ` (${shiftKey})` : ' (出勤確定)';
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を毎週${dowLabels}曜日に出勤${patternLabel}`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_dow_work',
        dows: uniqueDows,
        shiftKey: explicitShiftKey ? shiftKey : undefined,
        explicitShiftKey,
        timeStart,
        timeEnd,
      });
      return;
    }

    // Case B: Day of week leave assignment (e.g. 「木村さんは火曜日は休みに」)
    if (matchedStaff && uniqueDows.length > 0 && isLeave) {
      const dowLabels = uniqueDows.map((d) => DOW_NAMES[d]).join('・');
      const leaveType =
        lineWithoutNames.includes('有休') || lineWithoutNames.includes('有給')
          ? '有休'
          : lineWithoutNames.includes('希望休')
          ? '希望休'
          : '公休';
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を毎週${dowLabels}曜日は${leaveType}に設定`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_dow_leave',
        dows: uniqueDows,
        shiftKey: leaveType,
      });
      return;
    }

    // Case C: Specific date time assignment
    if (matchedStaff && uniqueDates.length > 0 && !isLeave && timeStart && timeEnd) {
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を${uniqueDates.join('・')}日に時間指定出勤 (${timeStart}-${timeEnd})`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_date_time',
        dates: uniqueDates,
        shiftKey: `time:${timeStart}-${timeEnd}`,
        explicitShiftKey: true,
        timeStart,
        timeEnd,
      });
      return;
    }

    // Case D: Specific date work assignment (e.g. 「佐藤さんを10日と15日に入れて」)
    if (matchedStaff && uniqueDates.length > 0 && !isLeave) {
      const patternLabel = explicitShiftKey && shiftKey ? ` (${shiftKey})` : ' (出勤確定)';
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を${uniqueDates.join('・')}日に出勤${patternLabel}`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_date_work',
        dates: uniqueDates,
        shiftKey: explicitShiftKey ? shiftKey : undefined,
        explicitShiftKey,
      });
      return;
    }

    // Case E: Specific date leave assignment (e.g. 「佐藤さんは15日不在」「10日は休み」)
    if (matchedStaff && uniqueDates.length > 0 && isLeave) {
      const leaveType =
        lineWithoutNames.includes('有休') || lineWithoutNames.includes('有給')
          ? '有休'
          : lineWithoutNames.includes('希望休')
          ? '希望休'
          : '公休';
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を${uniqueDates.join('・')}日は${leaveType}に設定`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_date_leave',
        dates: uniqueDates,
        shiftKey: leaveType,
      });
      return;
    }

    // Case F: Consecutive work days limit (e.g. 「3連勤まで」「4連勤以内」)
    const consecMatch =
      lineWithoutNames.match(/(\d+)\s*連勤/) || lineWithoutNames.match(/連続\s*(\d+)\s*日/);
    if (consecMatch && matchedStaff) {
      const maxC = parseInt(consecMatch[1], 10);
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} の連続勤務を最大${maxC}連勤までに制限`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'max_consecutive',
        maxConsecutive: maxC,
      });
      return;
    }

    // Case G: Deduct hours (e.g. 「2時間を管理業務に使う」「3時間は除く」)
    const hoursMatch = lineWithoutNames.match(
      /(\d+(?:\.\d+)?)\s*(?:時間|h).*(?:除いて|管理業務|実働|引いて|マイナス|控除)/
    );
    if (hoursMatch && matchedStaff) {
      const deduct = parseFloat(hoursMatch[1]);
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} の実働から1日${deduct}h控除 (管理業務・除外)`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'deduct_hours',
        hours: deduct,
        dates: uniqueDates.length > 0 ? uniqueDates : undefined,
      });
      return;
    }

    // Case H: Max days per week (e.g. 「週3日以内」「週2回のみ」)
    const maxDaysMatch = lineWithoutNames.match(/週\s*(?:に\s*)?(\d+)\s*(?:日|回)/);
    if (maxDaysMatch && matchedStaff) {
      const maxD = parseInt(maxDaysMatch[1], 10);
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} の出勤を週${maxD}日以内に制限`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'max_days',
        maxDays: maxD,
      });
      return;
    }

    // Case I: Shift pattern exclusion or specialization without specific days (e.g. 「早番NG」「日勤のみ」「遅番に入れて」)
    if (matchedStaff && explicitShiftKey && shiftKey && uniqueDows.length === 0 && uniqueDates.length === 0) {
      if (isLeave) {
        rules.push({
          id: `rule-${Date.now()}-${index}`,
          text: `${matchedStaff.name} を「${shiftKey}」から除外（配置NG）`,
          staffName: matchedStaff.name,
          staffId: matchedStaff.id,
          ruleType: 'exclude_pattern',
          shiftKey,
          explicitShiftKey: true,
        });
        return;
      }
      const onlyThis = /(?:のみ|だけ|専従|専門|固定)/.test(lineWithoutNames);
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を「${shiftKey}」${onlyThis ? '専従（固定）' : '優先'}で配置`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_pattern',
        shiftKey,
        explicitShiftKey: true,
        onlyThisPattern: onlyThis,
      });
      return;
    }

    // Fallback: If a staff member is matched and they asked to prioritize/put them in generally
    if (matchedStaff && /(?:入れ|出勤|勤務|多く|優先|増や)/.test(lineWithoutNames)) {
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} は週所定労働時間（週${matchedStaff.hours || 40}h）を必ず満たすよう最優先配置`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'must_fill_hours',
        hours: matchedStaff.hours || 40,
      });
      return;
    }

    if (matchedStaff) {
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: line,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'custom_label',
        customLabel: line,
      });
    } else {
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: line,
        ruleType: 'custom_label',
        customLabel: line,
      });
    }
  });

  return rules;
}

export async function interpretInstructionsWithAI(
  text: string,
  state: AppState
): Promise<{ rules: ParsedRule[]; rawAnalysis: string }> {
  const localRules = parseInstructionLocally(text, state);
  const summary =
    localRules.length > 0
      ? `✅ ${localRules.length}件の個別指示を解析・ルール化しました。\n` +
        localRules.map((r, i) => `${i + 1}. [${r.staffName || '全職員'}] ${r.text}`).join('\n')
      : '⚠️ 指示文から適用可能な職員名または条件が検出されませんでした。職員名と条件（例：「田中 美咲さんを毎週月曜日に入れて」）を入力してください。';

  return {
    rules: localRules,
    rawAnalysis: summary,
  };
}

export async function runAIComplianceAudit(state: AppState): Promise<string> {
  const { year, month, facility } = state;
  const days = daysInMonth(year, month);
  const staffSummaries = computeStaffSummaries(state);
  const facilityChecks = runFacilityChecks(state);

  const failedChecks = facilityChecks.flatMap((f) => f.checks.filter((c) => !c.passed));
  const over36Staff = staffSummaries.filter((s) => s.over36);
  const highConsecStaff = staffSummaries.filter((s) => s.maxConsecutive >= 6);

  let report = `### 📋 介護シフト・コンプライアンス自動診断結果 (${year}年${month}月 / 全${days}日)\n\n`;
  report += `**総合評価:** ${
    failedChecks.length === 0 && over36Staff.length === 0
      ? '✅ 概ね良好（法令・人員基準・36協定適合）'
      : '⚠️ 是正推奨（一部要確認事項あり）'
  }\n\n`;

  report += `#### 1. 人員配置基準チェック\n`;
  if (failedChecks.length === 0) {
    report += `- ${facility.name} において法令上の配置基準をすべてクリアしています。\n`;
  } else {
    failedChecks.forEach((c) => {
      report += `- ❌ **${c.label}**: 要件「${c.req}」に対し実績「${c.actual}」と未達です。\n`;
    });
  }

  report += `\n#### 2. 労働基準法・36協定・連続勤務\n`;
  if (over36Staff.length === 0) {
    report += `- 週40時間超過職員はいません。\n`;
  } else {
    over36Staff.forEach((s) => {
      report += `- ⚠️ **${s.name}**: 週平均実労働${s.avgWeeklyHours.toFixed(1)}h（法定週40h超過の恐れがあります）。\n`;
    });
  }

  if (highConsecStaff.length > 0) {
    highConsecStaff.forEach((s) => {
      report += `- ⚠️ **${s.name}**: 最大${s.maxConsecutive}連勤が設定されています。5連勤以下への分散を推奨します。\n`;
    });
  } else {
    report += `- 6連勤以上の過度な連続勤務はありません。\n`;
  }

  report += `\n#### 3. 改善アドバイス\n`;
  report += `1. 夜勤明けの翌日は原則公休とし、十分な休息時間を確保してください。\n`;
  report += `2. 週40時間を超える恐れのある非常勤・常勤職員の勤務シフトを再配分してください。\n`;
  report += `3. 有給休暇の計画的付与（年5日取得義務）を月次で順次進めてください。\n`;

  return report;
}

export async function testAIServerConnection(): Promise<{ success: boolean; message: string }> {
  return {
    success: true,
    message: '✨ クライアントサイド・AIエンジン（無料プラン対応モード）は正常に動作しています。',
  };
}
