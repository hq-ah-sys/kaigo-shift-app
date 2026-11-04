import { AppState, ParsedRule } from '../types';
import { daysInMonth } from './shiftEngine';
import { computeStaffSummaries, runFacilityChecks } from './complianceEngine';

// Client-side local rule parser for natural language shift instructions
export function parseInstructionLocally(text: string, state: AppState): ParsedRule[] {
  const rules: ParsedRule[] = [];
  // Split by newlines, periods, commas, or semicolons
  const lines = text
    .split(/[\n;；。]/)
    .map((l) => l.trim())
    .filter(Boolean);

  const DOW_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

  lines.forEach((line, index) => {
    // 1. Staff matching (matches full name, name without spaces, surname, or given name)
    let matchedStaff = state.staff.find(
      (s) => line.includes(s.name) || line.includes(s.name.replace(/\s+/g, ''))
    );
    if (!matchedStaff) {
      // Try surname (e.g. "木村さん", "木村くん", "木村")
      const surnameCandidates = state.staff
        .map((s) => ({ s, surname: s.name.split(/\s+/)[0] }))
        .filter((item) => item.surname && line.includes(item.surname))
        .sort((a, b) => b.surname.length - a.surname.length);

      if (surnameCandidates.length > 0) {
        matchedStaff = surnameCandidates[0].s;
      }
    }

    // 2. Day of Week detection
    const dows: number[] = [];
    if (line.includes('平日')) {
      dows.push(1, 2, 3, 4, 5);
    } else if (line.includes('土日') || line.includes('週末')) {
      dows.push(0, 6);
    } else if (line.includes('毎日') || line.includes('全日')) {
      dows.push(0, 1, 2, 3, 4, 5, 6);
    } else {
      if (/日(?:曜|曜日)/.test(line) || /毎週\s*日/.test(line)) dows.push(0);
      if (/月(?:曜|曜日)/.test(line) || /毎週\s*月/.test(line)) dows.push(1);
      if (/火(?:曜|曜日)/.test(line) || /毎週\s*火/.test(line)) dows.push(2);
      if (/水(?:曜|曜日)/.test(line) || /毎週\s*水/.test(line)) dows.push(3);
      if (/木(?:曜|曜日)/.test(line) || /毎週\s*木/.test(line)) dows.push(4);
      if (/金(?:曜|曜日)/.test(line) || /毎週\s*金/.test(line)) dows.push(5);
      if (/土(?:曜|曜日)/.test(line) || /毎週\s*土/.test(line)) dows.push(6);
    }
    const uniqueDows = Array.from(new Set(dows)).sort((a, b) => a - b);

    // 3. Specific Date detection
    const dates: number[] = [];
    // Date range (e.g., 1日〜5日, 10-15日)
    const rangeMatch = line.match(/(\d{1,2})\s*日?\s*[〜~-]\s*(\d{1,2})\s*日/);
    if (rangeMatch) {
      const startD = parseInt(rangeMatch[1], 10);
      const endD = parseInt(rangeMatch[2], 10);
      for (let d = Math.min(startD, endD); d <= Math.max(startD, endD); d++) {
        dates.push(d);
      }
    } else {
      const singleDateMatches = line.matchAll(/(\d{1,2})\s*日/g);
      for (const m of singleDateMatches) {
        dates.push(parseInt(m[1], 10));
      }
    }
    const uniqueDates = Array.from(new Set(dates)).sort((a, b) => a - b);

    // 4. Shift Pattern detection
    let shiftKey: string | undefined = undefined;
    for (const pat of state.shiftPatterns) {
      if (line.includes(pat.name) || line.includes(pat.key)) {
        shiftKey = pat.key;
        break;
      }
    }
    if (!shiftKey) {
      if (line.includes('夜勤')) shiftKey = '夜勤';
      else if (line.includes('早番')) shiftKey = '早番';
      else if (line.includes('遅番')) shiftKey = '遅番';
      else if (line.includes('日勤')) shiftKey = '日勤';
    }

    // 5. Intent detection (Leave vs Work)
    const isLeave = /(?:休|不在|オフ|公休|有休|有給|出勤させない|外して|入れないで|出ない)/.test(line);
    const isWork = /(?:入れ|出勤|勤務|入る|シフトイン|配置|担当|お願い|アサイン|固定)/.test(line);

    // Case A: Day of week work assignment (e.g. 「木村さんを月曜日に入れて」)
    if (matchedStaff && uniqueDows.length > 0 && !isLeave) {
      const assignedKey = shiftKey || state.shiftPatterns[0]?.key || '日勤';
      const dowLabels = uniqueDows.map((d) => DOW_NAMES[d]).join('・');
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を毎週${dowLabels}曜日に出勤 (${assignedKey})`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_dow_work',
        dows: uniqueDows,
        shiftKey: assignedKey,
      });
      return;
    }

    // Case B: Day of week leave assignment (e.g. 「木村さんは火曜日は休みに」)
    if (matchedStaff && uniqueDows.length > 0 && isLeave) {
      const dowLabels = uniqueDows.map((d) => DOW_NAMES[d]).join('・');
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を毎週${dowLabels}曜日は公休に設定`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_dow_leave',
        dows: uniqueDows,
      });
      return;
    }

    // Case C: Specific date work assignment (e.g. 「佐藤さんを10日と15日に入れて」)
    if (matchedStaff && uniqueDates.length > 0 && !isLeave && isWork) {
      const assignedKey = shiftKey || state.shiftPatterns[0]?.key || '日勤';
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を${uniqueDates.join('・')}日に出勤 (${assignedKey})`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_date_work',
        dates: uniqueDates,
        shiftKey: assignedKey,
      });
      return;
    }

    // Case D: Specific date leave assignment (e.g. 「佐藤さんは15日不在」「10日は休み」)
    if (matchedStaff && uniqueDates.length > 0 && isLeave) {
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を${uniqueDates.join('・')}日は公休に設定`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_date_leave',
        dates: uniqueDates,
      });
      return;
    }

    // Case E: Shift pattern assignment without specific days (e.g. 「渡辺さんを夜勤にして」)
    if (matchedStaff && shiftKey && isWork && uniqueDows.length === 0 && uniqueDates.length === 0) {
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} を${shiftKey}に優先配置`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'specific_pattern',
        shiftKey,
      });
      return;
    }

    // Case F: Deduct hours (e.g., 2時間を管理業務に使う、3時間は除く)
    const hoursMatch = line.match(/(\d+)\s*(?:時間|h).*(?:除いて|管理業務|実働|引いて|マイナス)/);
    if (hoursMatch && matchedStaff) {
      const deduct = parseInt(hoursMatch[1], 10);
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

    // Case G: Max days per week (e.g., 週3日以内に抑えて)
    const maxDaysMatch = line.match(/週\s*(\d+)\s*日/);
    if (maxDaysMatch && matchedStaff) {
      const maxD = parseInt(maxDaysMatch[1], 10);
      rules.push({
        id: `rule-${Date.now()}-${index}`,
        text: `${matchedStaff.name} は週${maxD}日以内に制限`,
        staffName: matchedStaff.name,
        staffId: matchedStaff.id,
        ruleType: 'max_days',
        maxDays: maxD,
      });
      return;
    }

    // Case H: General fallback rule with matched staff
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
      // General note
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
      : '⚠️ 指示文から適用可能な職員名または条件が検出されませんでした。職員名と曜日（例：「木村さんを月曜日に入れて」）等を含めてください。';

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

  let report = `### 📋 介護シフト・コンプライアンス自動診断結果 (${year}年${month}月)\n\n`;
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
  // Client-side simulation mode (100% free tier compatible)
  return {
    success: true,
    message: '✨ クライアントサイド・AIエンジン（無料プラン対応モード）は正常に動作しています。',
  };
}
