using System.Diagnostics;
using System.Text;

namespace ApkPcTester;

internal sealed record ProcessResult(int ExitCode, string StdOut, string StdErr)
{
    public bool Success => ExitCode == 0;
}

internal static class ProcessRunner
{
    public static async Task<ProcessResult> RunAsync(
        string fileName,
        IEnumerable<string> args,
        CancellationToken cancellationToken = default,
        int timeoutMs = 120_000)
    {
        using var process = new Process();
        process.StartInfo = CreateStartInfo(fileName, args, redirect: true);

        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) stdout.AppendLine(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) stderr.AppendLine(e.Data); };

        if (!process.Start())
            throw new InvalidOperationException($"프로세스를 시작할 수 없습니다: {fileName}");

        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(timeoutMs);
        try
        {
            await process.WaitForExitAsync(timeoutCts.Token);
            await Task.Delay(30, CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            if (cancellationToken.IsCancellationRequested) throw;
            throw new TimeoutException($"명령이 {timeoutMs / 1000}초 안에 끝나지 않았습니다: {fileName}");
        }

        return new ProcessResult(process.ExitCode, stdout.ToString().TrimEnd(), stderr.ToString().TrimEnd());
    }

    public static Process StartDetached(string fileName, IEnumerable<string> args)
    {
        var process = new Process { StartInfo = CreateStartInfo(fileName, args, redirect: false) };
        if (!process.Start())
            throw new InvalidOperationException($"프로세스를 시작할 수 없습니다: {fileName}");
        return process;
    }

    public static Process StartStreaming(
        string fileName,
        IEnumerable<string> args,
        Action<string> onStdOut,
        Action<string> onStdErr,
        Action<int>? onExit = null)
    {
        var process = new Process { EnableRaisingEvents = true };
        process.StartInfo = CreateStartInfo(fileName, args, redirect: true);
        process.OutputDataReceived += (_, e) => { if (e.Data is not null) onStdOut(e.Data); };
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) onStdErr(e.Data); };
        process.Exited += (_, _) => onExit?.Invoke(process.ExitCode);

        if (!process.Start())
            throw new InvalidOperationException($"프로세스를 시작할 수 없습니다: {fileName}");
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static ProcessStartInfo CreateStartInfo(string fileName, IEnumerable<string> args, bool redirect)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            UseShellExecute = false,
            CreateNoWindow = redirect,
            RedirectStandardOutput = redirect,
            RedirectStandardError = redirect,
            StandardOutputEncoding = redirect ? Encoding.UTF8 : null,
            StandardErrorEncoding = redirect ? Encoding.UTF8 : null
        };
        foreach (var arg in args) psi.ArgumentList.Add(arg);
        return psi;
    }

    public static void TryKill(Process? process)
    {
        try
        {
            if (process is { HasExited: false }) process.Kill(entireProcessTree: true);
        }
        catch { }
    }
}
