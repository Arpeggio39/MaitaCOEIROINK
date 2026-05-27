using System.Text.RegularExpressions;
using MaitaCOEIROINK.Models;

namespace MaitaCOEIROINK.Services;

public static class SegmentParser
{
    private static readonly Regex PunctRegex = new(AppConstants.SegmentPunctPattern, RegexOptions.Compiled);

    public static bool IsSegmentPunctuation(char ch) => PunctRegex.IsMatch(ch.ToString());

    private static bool IsSegmentWhitespace(char ch) => ch is ' ' or '\t' or '\u3000';

    private static bool IsSegmentNewline(char ch) => ch is '\n' or '\r';

    public static List<SentenceRange> SentenceRangesFromText(string text)
    {
        var ranges = new List<SentenceRange>();
        var buf = new System.Text.StringBuilder();
        var segStart = 0;
        var index = 0;

        void FlushSegment(int breakEnd)
        {
            var raw = buf.ToString();
            var trimmed = raw.Trim();
            if (trimmed.Length == 0)
            {
                buf.Clear();
                segStart = breakEnd;
                return;
            }

            var lead = raw.Length - raw.TrimStart().Length;
            var start = segStart + lead;
            var end = start + trimmed.Length;
            ranges.Add(new SentenceRange
            {
                Key = $"s{start}",
                Start = start,
                End = end,
                Text = text[start..end],
                Index = index++,
            });
            buf.Clear();
            segStart = breakEnd;
        }

        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (IsSegmentPunctuation(ch))
            {
                buf.Append(ch);
                FlushSegment(i + 1);
                continue;
            }

            if (IsSegmentWhitespace(ch) || IsSegmentNewline(ch))
            {
                FlushSegment(i + 1);
                while (i + 1 < text.Length && (IsSegmentWhitespace(text[i + 1]) || IsSegmentNewline(text[i + 1])))
                {
                    i++;
                }

                segStart = i + 1;
                continue;
            }

            buf.Append(ch);
        }

        FlushSegment(text.Length);
        return ranges;
    }

    public static SentenceRange? FindRangeAtCursor(int pos, IReadOnlyList<SentenceRange> ranges)
    {
        foreach (var r in ranges)
        {
            if (pos >= r.Start && pos < r.End) return r;
        }

        return null;
    }

    public static void RemapSentenceParams(Project project, IReadOnlyList<SentenceRange> prevRanges, IReadOnlyList<SentenceRange> newRanges)
    {
        var oldMap = project.SentenceParamsByKey;
        var next = new Dictionary<string, ParamSet>();
        var usedOldKeys = new HashSet<string>();

        foreach (var nr in newRanges)
        {
            if (oldMap.TryGetValue(nr.Key, out var direct))
            {
                next[nr.Key] = direct.Clone();
                continue;
            }

            var prev = prevRanges.FirstOrDefault(pr => pr.Text == nr.Text && !usedOldKeys.Contains(pr.Key));
            if (prev != null && oldMap.TryGetValue(prev.Key, out var fromPrev))
            {
                next[nr.Key] = fromPrev.Clone();
                usedOldKeys.Add(prev.Key);
            }
        }

        project.SentenceParamsByKey = next;
    }

    public static void RemapSentenceProsody(Project project, IReadOnlyList<SentenceRange> prevRanges, IReadOnlyList<SentenceRange> newRanges)
    {
        var oldMap = project.SentenceProsodyByKey;
        var next = new Dictionary<string, SegmentProsody>();
        var usedOldKeys = new HashSet<string>();

        foreach (var nr in newRanges)
        {
            if (oldMap.TryGetValue(nr.Key, out var direct) && direct.Text == nr.Text)
            {
                next[nr.Key] = direct.Clone();
                continue;
            }

            var prev = prevRanges.FirstOrDefault(pr => pr.Text == nr.Text && !usedOldKeys.Contains(pr.Key));
            if (prev != null && oldMap.TryGetValue(prev.Key, out var fromPrev) && fromPrev.Text == nr.Text)
            {
                next[nr.Key] = fromPrev.Clone();
                usedOldKeys.Add(prev.Key);
            }
        }

        project.SentenceProsodyByKey = next;
    }

    public static ParamSet GetSentenceParams(Project? project, string key)
    {
        if (project is null) return ParamDefaults.Create();
        var merged = project.Params.Clone();
        if (project.SentenceParamsByKey.TryGetValue(key, out var custom))
        {
            return custom.Clone();
        }

        return merged;
    }

    public static bool HasCustomSentenceParams(Project? project, string key)
        => project?.SentenceParamsByKey.ContainsKey(key) == true;
}
