namespace MaitaCOEIROINK.Services;

public static class WavHelper
{
    public static byte[] ConcatWavBuffers(IReadOnlyList<byte[]> buffers)
    {
        if (buffers.Count == 0) throw new InvalidOperationException("結合する音声がありません");
        if (buffers.Count == 1) return buffers[0];
        var parsed = buffers.Select(ParseWav).ToList();
        var m0 = parsed[0];
        for (var i = 1; i < parsed.Count; i++)
        {
            var m = parsed[i];
            if (m.SampleRate != m0.SampleRate || m.NumChannels != m0.NumChannels || m.BitsPerSample != m0.BitsPerSample)
            {
                throw new InvalidOperationException("行ごとの WAV 形式が一致しません。サンプルレートを固定して再試行してください。");
            }
        }

        var totalPcm = parsed.Sum(p => p.Pcm.Length);
        var merged = new byte[totalPcm];
        var off = 0;
        foreach (var p in parsed)
        {
            Buffer.BlockCopy(p.Pcm, 0, merged, off, p.Pcm.Length);
            off += p.Pcm.Length;
        }

        return BuildStandardWav(m0.SampleRate, m0.NumChannels, m0.BitsPerSample, merged);
    }

    private sealed record WavMeta(int SampleRate, int NumChannels, int BitsPerSample, byte[] Pcm);

    private static WavMeta ParseWav(byte[] ab)
    {
        if (ab.Length < 44) throw new InvalidOperationException("WAV が短すぎます");
        int? sampleRate = null;
        int? numChannels = null;
        int? bitsPerSample = null;
        var dataOffset = 0;
        var dataSize = 0;
        var offset = 12;
        while (offset + 8 <= ab.Length)
        {
            var id = System.Text.Encoding.ASCII.GetString(ab, offset, 4);
            var chunkSize = BitConverter.ToInt32(ab, offset + 4);
            if (id == "fmt ")
            {
                numChannels = BitConverter.ToInt16(ab, offset + 10);
                sampleRate = BitConverter.ToInt32(ab, offset + 12);
                bitsPerSample = BitConverter.ToInt16(ab, offset + 22);
            }
            else if (id == "data")
            {
                dataOffset = offset + 8;
                dataSize = chunkSize;
                break;
            }

            offset += 8 + chunkSize;
        }

        if (sampleRate == null || numChannels == null || bitsPerSample == null || dataSize == 0)
        {
            throw new InvalidOperationException("WAV の解析に失敗しました");
        }

        var pcm = new byte[dataSize];
        Buffer.BlockCopy(ab, dataOffset, pcm, 0, dataSize);
        return new WavMeta(sampleRate.Value, numChannels.Value, bitsPerSample.Value, pcm);
    }

    private static byte[] BuildStandardWav(int sampleRate, int numChannels, int bitsPerSample, byte[] pcmData)
    {
        var blockAlign = numChannels * bitsPerSample / 8;
        var byteRate = sampleRate * blockAlign;
        var dataSize = pcmData.Length;
        var buffer = new byte[44 + dataSize];
        System.Text.Encoding.ASCII.GetBytes("RIFF").CopyTo(buffer, 0);
        BitConverter.GetBytes(36 + dataSize).CopyTo(buffer, 4);
        System.Text.Encoding.ASCII.GetBytes("WAVE").CopyTo(buffer, 8);
        System.Text.Encoding.ASCII.GetBytes("fmt ").CopyTo(buffer, 12);
        BitConverter.GetBytes(16).CopyTo(buffer, 16);
        BitConverter.GetBytes((short)1).CopyTo(buffer, 20);
        BitConverter.GetBytes((short)numChannels).CopyTo(buffer, 22);
        BitConverter.GetBytes(sampleRate).CopyTo(buffer, 24);
        BitConverter.GetBytes(byteRate).CopyTo(buffer, 28);
        BitConverter.GetBytes((short)blockAlign).CopyTo(buffer, 32);
        BitConverter.GetBytes((short)bitsPerSample).CopyTo(buffer, 34);
        System.Text.Encoding.ASCII.GetBytes("data").CopyTo(buffer, 36);
        BitConverter.GetBytes(dataSize).CopyTo(buffer, 40);
        pcmData.CopyTo(buffer, 44);
        return buffer;
    }
}
