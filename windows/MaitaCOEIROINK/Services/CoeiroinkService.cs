using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using MaitaCOEIROINK.Models;

namespace MaitaCOEIROINK.Services;

public sealed class CoeiroinkService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromMinutes(3) };
    private string? _resolvedBase;
    private int _maitaStyleId;

    public async Task<string> ResolveApiBaseAsync(CancellationToken ct = default)
    {
        if (_resolvedBase != null) return _resolvedBase;
        Exception? last = null;
        foreach (var baseUrl in new[] { AppConstants.DefaultApiBase, "http://localhost:50032" })
        {
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromSeconds(4));
                var res = await _http.GetAsync($"{baseUrl}/", cts.Token);
                res.EnsureSuccessStatusCode();
                _resolvedBase = baseUrl;
                return baseUrl;
            }
            catch (Exception ex)
            {
                last = ex;
            }
        }

        throw last ?? new InvalidOperationException("COEIROINK に接続できません。COEIROINK を起動してから再度お試しください。");
    }

    public async Task<int> ResolveMaitaStyleIdAsync(CancellationToken ct = default)
    {
        if (_maitaStyleId != 0) return _maitaStyleId;
        var baseUrl = await ResolveApiBaseAsync(ct);
        var list = await _http.GetFromJsonAsync<List<SpeakerMeta>>($"{baseUrl}/v1/speakers_path_variant", JsonOptions, ct)
            ?? throw new InvalidOperationException("話者一覧の取得に失敗しました");
        var maita = list.FirstOrDefault(s => s.SpeakerUuid == AppConstants.MaitaUuid)
            ?? throw new InvalidOperationException("この COEIROINK に琵音マイタが見つかりません。");
        if (maita.Styles.Count == 0) throw new InvalidOperationException("琵音マイタのスタイルが見つかりません。");
        var preferred = maita.Styles.FirstOrDefault(s => s.StyleName == "のーまる")
            ?? maita.Styles.FirstOrDefault(s => s.StyleName.Contains("のーまる", StringComparison.Ordinal))
            ?? maita.Styles[0];
        _maitaStyleId = preferred.StyleId;
        return _maitaStyleId;
    }

    public async Task SyncDictionaryAsync(IReadOnlyList<DictionaryEntry> rows, CancellationToken ct = default)
    {
        var payload = new
        {
            dictionaryWords = rows.Select(e => new
            {
                word = e.Word,
                yomi = e.Yomi,
                accent = (int)Math.Max(0, Math.Floor(e.Accent)),
                numMoras = LocalStorageService.CountMorasFromYomi(e.Yomi),
            }),
        };
        await PostJsonRawAsync("/v1/set_dictionary", payload, 20000, ct);
    }

    public async Task<List<List<SegmentMora>>> EstimateProsodyAsync(string text, CancellationToken ct = default)
    {
        var data = await PostJsonAsync<ProsodyResponse>("/v1/estimate_prosody", new { text }, 30000, ct);
        if (data?.Detail is not { Count: > 0 }) throw new InvalidOperationException("韻律データが空です");
        return CloneDetail(data.Detail);
    }

    public async Task<List<List<SegmentMora>>> EstimateProsodyFromKanaAsync(string kana, CancellationToken ct = default)
    {
        var data = await PostJsonAsync<ProsodyResponse>("/v1/estimate_prosody_from_kana", new { text = kana }, 30000, ct);
        if (data?.Detail is not { Count: > 0 }) throw new InvalidOperationException("韻律データが空です");
        return CloneDetail(data.Detail);
    }

    public async Task EnsureSegmentProsodyAsync(Project project, string key, string text, bool force, CancellationToken ct = default)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return;

        project.SentenceProsodyByKey ??= new Dictionary<string, SegmentProsody>();
        if (force) project.SentenceProsodyByKey.Remove(key);

        if (!force
            && project.SentenceProsodyByKey.TryGetValue(key, out var cached)
            && cached.Text == trimmed
            && cached.Detail.Count > 0)
        {
            return;
        }

        var detail = await EstimateProsodyAsync(trimmed, ct);
        ApplyDefaultMoraPitches(detail);
        var entry = new SegmentProsody { Text = trimmed, Detail = detail };
        project.SentenceProsodyByKey[key] = entry;

        try
        {
            var speedScale = SegmentParser.GetSentenceParams(project, key).SpeedScale;
            await FetchPredictF0ForProsodyAsync(trimmed, detail, entry, speedScale, ct);
        }
        catch
        {
            /* F0 推定失敗はスライダー表示のみ影響 */
        }
    }

    public async Task ReestimateProsodyFromKanaAsync(Project project, string key, CancellationToken ct = default)
    {
        if (!project.SentenceProsodyByKey.TryGetValue(key, out var entry) || entry.Detail.Count == 0) return;
        var kana = string.Concat(entry.Detail.SelectMany(p => p).Select(m => m.Hira)).Trim();
        if (kana.Length == 0) return;

        var oldPitches = entry.Detail.SelectMany(p => p).Select(m => m.GetPitch()).ToList();
        var newDetail = await EstimateProsodyFromKanaAsync(kana, ct);
        ApplyDefaultMoraPitches(newDetail);
        var flatNew = newDetail.SelectMany(p => p).ToList();
        for (var i = 0; i < flatNew.Count; i++)
        {
            if (i < oldPitches.Count) flatNew[i].Pitch = oldPitches[i];
        }

        entry.Detail = newDetail;
        var savedPitches = entry.Detail.SelectMany(p => p).Select(m => m.GetPitch()).ToList();
        try
        {
            var speedScale = SegmentParser.GetSentenceParams(project, key).SpeedScale;
            await FetchPredictF0ForProsodyAsync(entry.Text, entry.Detail, entry, speedScale, ct);
            flatNew = entry.Detail.SelectMany(p => p).ToList();
            for (var i = 0; i < flatNew.Count; i++)
            {
                if (i < savedPitches.Count) flatNew[i].Pitch = savedPitches[i];
            }
        }
        catch
        {
            entry.BaseF0 = null;
            entry.BaselinePitch = null;
            entry.MoraWavRanges = null;
            entry.F0TotalSamples = null;
            entry.F0SpeedScale = null;
        }
    }

    public async Task EnsureProsodyF0MetadataAsync(string text, SegmentProsody entry, double speedScale, CancellationToken ct = default)
    {
        var speedChanged = entry.F0SpeedScale != null && entry.F0SpeedScale != speedScale;
        if (!speedChanged && entry.BaseF0 is { Count: > 0 } && entry.MoraWavRanges is { Count: > 0 } && entry.F0TotalSamples > 0)
        {
            return;
        }

        if (entry.Detail.Count == 0) return;
        List<double>? savedPitches = speedChanged
            ? null
            : entry.Detail.SelectMany(p => p).Select(m => m.GetPitch()).ToList();
        try
        {
            await FetchPredictF0ForProsodyAsync(text, entry.Detail, entry, speedScale, ct);
            if (savedPitches != null)
            {
                var flat = entry.Detail.SelectMany(p => p).ToList();
                for (var i = 0; i < flat.Count; i++)
                {
                    if (i < savedPitches.Count) flat[i].Pitch = savedPitches[i];
                }
            }
        }
        catch
        {
            /* 合成時フォールバック失敗 */
        }
    }

    public async Task<byte[]> SynthesizeLineAsync(
        string textLine,
        ParamSet parameters,
        SegmentProsody? prosody,
        int outputSamplingRate,
        CancellationToken ct = default)
    {
        if (prosody?.Detail.Count > 0)
        {
            await EnsureProsodyF0MetadataAsync(textLine, prosody, parameters.SpeedScale, ct);
        }

        var styleId = await ResolveMaitaStyleIdAsync(ct);
        var body = new Dictionary<string, object?>
        {
            ["speakerUuid"] = AppConstants.MaitaUuid,
            ["styleId"] = styleId,
            ["text"] = textLine,
            ["prosodyDetail"] = ProsodyDetailForApi(prosody?.Detail ?? []),
            ["speedScale"] = parameters.SpeedScale,
            ["volumeScale"] = parameters.VolumeScale,
            ["pitchScale"] = parameters.PitchScale,
            ["intonationScale"] = parameters.IntonationScale,
            ["prePhonemeLength"] = parameters.PrePhonemeLength,
            ["postPhonemeLength"] = parameters.PostPhonemeLength,
            ["outputSamplingRate"] = CoerceSampleRate(outputSamplingRate),
            ["processingAlgorithm"] = parameters.ProcessingAlgorithm,
            ["sampledIntervalValue"] = 0,
            ["adjustedF0"] = Array.Empty<double>(),
        };

        if (prosody != null && HasProsodyPitchEdits(prosody))
        {
            var adjusted = BuildAdjustedF0ForSynthesis(prosody);
            if (adjusted != null) body["adjustedF0"] = adjusted;
        }

        var baseUrl = await ResolveApiBaseAsync(ct);
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/v1/synthesis")
        {
            Content = new StringContent(JsonSerializer.Serialize(body, JsonOptions), Encoding.UTF8, "application/json"),
        };
        req.Headers.TryAddWithoutValidation("Accept", "audio/wav");
        using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!res.IsSuccessStatusCode)
        {
            var err = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(err) ? $"HTTP {(int)res.StatusCode}" : err);
        }

        return await res.Content.ReadAsByteArrayAsync(ct);
    }

    public async Task<byte[]> BuildFullUtteranceAsync(Project project, string editorText, int outputSamplingRate, CancellationToken ct = default)
    {
        var ranges = SegmentParser.SentenceRangesFromText(editorText);
        if (ranges.Count == 0)
        {
            throw new InvalidOperationException("読み上げるテキストがありません（句読点・スペース・改行で区切られた部分が必要です）。");
        }

        var parts = new List<byte[]>();
        foreach (var r in ranges)
        {
            var parameters = SegmentParser.GetSentenceParams(project, r.Key);
            project.SentenceProsodyByKey.TryGetValue(r.Key, out var prosody);
            if (prosody == null || prosody.Text != r.Text.Trim())
            {
                await EnsureSegmentProsodyAsync(project, r.Key, r.Text, false, ct);
                project.SentenceProsodyByKey.TryGetValue(r.Key, out prosody);
            }

            parts.Add(await SynthesizeLineAsync(r.Text, parameters, prosody, outputSamplingRate, ct));
        }

        return WavHelper.ConcatWavBuffers(parts);
    }

    private async Task FetchPredictF0ForProsodyAsync(
        string text,
        List<List<SegmentMora>> detail,
        SegmentProsody entry,
        double speedScale,
        CancellationToken ct)
    {
        var styleId = await ResolveMaitaStyleIdAsync(ct);
        var predictBody = new
        {
            speakerUuid = AppConstants.MaitaUuid,
            styleId,
            text,
            prosodyDetail = ProsodyDetailForApi(detail),
            speedScale,
        };
        var pred = await PostJsonAsync<PredictWithDurationResponse>("/v1/predict_with_duration", predictBody, 120000, ct)
            ?? throw new InvalidOperationException("ピッチ推定の応答が不正です");
        if (string.IsNullOrEmpty(pred.WavBase64) || pred.MoraDurations == null)
        {
            throw new InvalidOperationException("ピッチ推定の応答が不正です");
        }

        var f0data = await PostJsonAsync<F0Response>("/v1/estimate_f0", new
        {
            wavBase64 = pred.WavBase64,
            moraDurations = pred.MoraDurations,
        }, 60000, ct) ?? throw new InvalidOperationException("F0 データが空です");
        if (f0data.F0 == null || f0data.F0.Count == 0) throw new InvalidOperationException("F0 データが空です");

        ApplyF0ToProsodyDetail(detail, f0data.MoraDurations ?? pred.MoraDurations, f0data.F0, entry);
        entry.F0SpeedScale = speedScale;
    }

    private static void ApplyF0ToProsodyDetail(
        List<List<SegmentMora>> detail,
        List<MoraDurationDto> moraDurations,
        List<double> f0,
        SegmentProsody entry)
    {
        StoreF0Metadata(entry, detail, moraDurations, f0);
        var flat = detail.SelectMany(p => p).ToList();
        for (var i = 0; i < (entry.BaselinePitch?.Count ?? 0); i++)
        {
            if (i < flat.Count) flat[i].Pitch = entry.BaselinePitch![i];
        }
    }

    private static void StoreF0Metadata(
        SegmentProsody entry,
        List<List<SegmentMora>> detail,
        List<MoraDurationDto> moraDurations,
        List<double> f0)
    {
        var flat = detail.SelectMany(p => p).ToList();
        var totalSamples = 1;
        foreach (var md in moraDurations)
        {
            var pp = md.PhonemePitches;
            if (pp is not { Count: > 0 }) continue;
            totalSamples = Math.Max(totalSamples, pp[^1].WavRange.End);
        }

        var moraWavRanges = new List<MoraWavRange>();
        var baselinePitch = new List<double>();
        var moraIdx = 0;
        foreach (var md in moraDurations)
        {
            var hira = (md.Hira ?? "").Trim();
            if (hira.Length == 0 || moraIdx >= flat.Count) continue;
            var pp = md.PhonemePitches;
            if (pp is not { Count: > 0 }) continue;
            var start = pp[0].WavRange.Start;
            var end = pp[^1].WavRange.End;
            moraWavRanges.Add(new MoraWavRange { Start = start, End = end });
            baselinePitch.Add(HzToMoraPitch(MedianF0InRange(f0, start, end, totalSamples)));
            moraIdx++;
        }

        entry.BaseF0 = f0.ToList();
        entry.BaselinePitch = baselinePitch;
        entry.MoraWavRanges = moraWavRanges;
        entry.F0TotalSamples = totalSamples;
    }

    public static bool HasProsodyPitchEdits(SegmentProsody prosody)
    {
        var flat = prosody.Detail.SelectMany(p => p).ToList();
        var baseline = prosody.BaselinePitch;
        if (baseline is not { Count: > 0 } || baseline.Count != flat.Count) return false;
        for (var i = 0; i < flat.Count; i++)
        {
            if (Math.Abs(flat[i].GetPitch() - baseline[i]) > 0.001) return true;
        }

        return false;
    }

    public static List<double>? BuildAdjustedF0ForSynthesis(SegmentProsody prosody)
    {
        if (prosody.BaseF0 is not { Count: > 0 } || prosody.MoraWavRanges is not { Count: > 0 } || prosody.F0TotalSamples is not > 0)
        {
            return null;
        }

        var flat = prosody.Detail.SelectMany(p => p).ToList();
        var adjusted = prosody.BaseF0.ToList();
        var totalSamples = prosody.F0TotalSamples.Value;
        for (var mi = 0; mi < prosody.MoraWavRanges.Count; mi++)
        {
            if (mi >= flat.Count) break;
            var range = prosody.MoraWavRanges[mi];
            var i0 = (int)Math.Floor(range.Start / (double)totalSamples * adjusted.Count);
            var i1 = Math.Min(adjusted.Count - 1, (int)Math.Ceiling(range.End / (double)totalSamples * adjusted.Count));
            var basePitch = prosody.BaselinePitch?.ElementAtOrDefault(mi) ?? AppConstants.MoraPitchDefault;
            var delta = MoraPitchToHz(flat[mi].GetPitch()) - MoraPitchToHz(basePitch);
            if (Math.Abs(delta) <= 0.01) continue;
            for (var i = i0; i <= i1; i++)
            {
                if (adjusted[i] > 50) adjusted[i] = Math.Max(50, adjusted[i] + delta);
            }
        }

        return adjusted;
    }

    public static List<List<object>> ProsodyDetailForApi(List<List<SegmentMora>> detail)
        => detail.Select(phrase => phrase.Select(m => (object)new { m.Phoneme, m.Hira, m.Accent }).ToList()).ToList();

    public static void ApplyDefaultMoraPitches(List<List<SegmentMora>> detail)
    {
        foreach (var m in detail.SelectMany(p => p))
        {
            if (m.Pitch == null) m.Pitch = AppConstants.MoraPitchDefault;
        }
    }

    public static List<MoraUiCell> BuildHiraganaCells(List<List<SegmentMora>> phrases)
    {
        var cells = new List<MoraUiCell>();
        foreach (var m in phrases.SelectMany(p => p))
        {
            foreach (var ch in m.Hira)
            {
                cells.Add(new MoraUiCell { Mora = m, Char = ch.ToString(), Pitch = m.GetPitch() });
            }
        }

        return cells;
    }

    public static List<MoraSpanUi> BuildMoraSpans(List<List<SegmentMora>> phrases)
    {
        var spans = new List<MoraSpanUi>();
        var charIdx = 0;
        foreach (var m in phrases.SelectMany(p => p))
        {
            var len = Math.Max(1, m.Hira.Length);
            spans.Add(new MoraSpanUi { Mora = m, Hira = m.Hira, CharStart = charIdx, CharEnd = charIdx + len });
            charIdx += len;
        }

        return spans;
    }

    private static List<List<SegmentMora>> CloneDetail(List<List<SegmentMora>> detail)
        => detail.Select(p => p.Select(m => m.Clone()).ToList()).ToList();

    private static double HzToMoraPitch(double hz)
    {
        if (double.IsNaN(hz) || hz < 50) return AppConstants.MoraPitchDefault;
        var pitch = AppConstants.MoraPitchDefault + Math.Log2(hz / 200);
        return Math.Clamp(pitch, AppConstants.MoraPitchMin, AppConstants.MoraPitchMax);
    }

    private static double MoraPitchToHz(double pitch) => 200 * Math.Pow(2, pitch - AppConstants.MoraPitchDefault);

    private static double MedianF0InRange(List<double> f0, int wavStart, int wavEnd, int totalSamples)
    {
        if (f0.Count == 0 || totalSamples <= 0) return 0;
        var i0 = (int)Math.Floor(wavStart / (double)totalSamples * f0.Count);
        var i1 = Math.Min(f0.Count - 1, (int)Math.Ceiling(wavEnd / (double)totalSamples * f0.Count));
        var slice = f0.Skip(i0).Take(i1 - i0 + 1).Where(v => v > 50).OrderBy(v => v).ToList();
        if (slice.Count == 0) return 0;
        return slice[slice.Count / 2];
    }

    private static int CoerceSampleRate(int value)
    {
        if (AppConstants.SampleRateOptions.Contains(value)) return value;
        return AppConstants.SampleRateOptions.OrderBy(r => Math.Abs(r - value)).First();
    }

    private async Task<T?> PostJsonAsync<T>(string path, object body, int timeoutMs, CancellationToken ct)
    {
        var json = await PostJsonRawAsync(path, body, timeoutMs, ct);
        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    private async Task<string> PostJsonRawAsync(string path, object body, int timeoutMs, CancellationToken ct)
    {
        var baseUrl = await ResolveApiBaseAsync(ct);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(timeoutMs);
        using var res = await _http.PostAsJsonAsync($"{baseUrl}{path}", body, JsonOptions, cts.Token);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(string.IsNullOrWhiteSpace(text) ? $"HTTP {(int)res.StatusCode}" : text);
        }

        return text;
    }

    private sealed class SpeakerMeta
    {
        public string SpeakerUuid { get; set; } = "";
        public List<StyleMeta> Styles { get; set; } = [];
    }

    private sealed class StyleMeta
    {
        public int StyleId { get; set; }
        public string StyleName { get; set; } = "";
    }

    private sealed class ProsodyResponse
    {
        public List<List<SegmentMora>> Detail { get; set; } = [];
    }

    private sealed class PredictWithDurationResponse
    {
        public string? WavBase64 { get; set; }
        public List<MoraDurationDto>? MoraDurations { get; set; }
    }

    private sealed class F0Response
    {
        public List<double>? F0 { get; set; }
        public List<MoraDurationDto>? MoraDurations { get; set; }
    }

    private sealed class MoraDurationDto
    {
        public string? Hira { get; set; }
        public List<PhonemePitchDto>? PhonemePitches { get; set; }
    }

    private sealed class PhonemePitchDto
    {
        public WavRangeDto WavRange { get; set; } = new();
    }

    private sealed class WavRangeDto
    {
        public int Start { get; set; }
        public int End { get; set; }
    }
}
