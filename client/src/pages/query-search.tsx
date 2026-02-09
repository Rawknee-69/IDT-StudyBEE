import { useAuth } from "@/lib/clerkAuth";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Download, ExternalLink, Loader2, History, Globe, ChevronDown, ChevronUp, X, BookOpen } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export type QuerySearchResult =
  | { source: "local"; material: any; title: string; summaryContent: string | null; fileUrl: string; fileName: string }
  | { source: "web"; title: string; summaryContent: string | null; fileUrl: string; fileName?: string };

type WebFilter =
  | "all"
  | "pdf"
  | "ppt"
  | "doc"
  | "txt"
  | "xls"
  | "site_edu"
  | "site_gov"
  | "site_org"
  | "inurl_pdf"
  | "inurl_download"
  | "link";

interface QuerySearchHistoryItem {
  id: string;
  query: string;
  createdAt: string;
}

function safeText(s: string | null | undefined): string {
  if (s == null || typeof s !== "string") return "";
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export default function QuerySearch() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WebFilter>("all");
  const [submittedQuery, setSubmittedQuery] = useState<string | null>(null);
  const [submittedFilter, setSubmittedFilter] = useState<WebFilter>("all");
  const [results, setResults] = useState<QuerySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  const queryClient = useQueryClient();
  const { data: historyData, refetch: refetchHistory } = useQuery<{ searches: QuerySearchHistoryItem[] }>({
    queryKey: ["/api/query-search/history"],
    enabled: isAuthenticated,
  });

  const searches = historyData?.searches ?? [];
  const [dorksOpen, setDorksOpen] = useState(false);

  const runSearch = async (q: string, filterOverride?: WebFilter) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const f = filterOverride ?? filter;
    setIsSearching(true);
    setSubmittedQuery(trimmed);
    setSubmittedFilter(f);
    setResults([]);
    try {
      const data = await apiGet<{ results: QuerySearchResult[] }>(
        `/api/query-search?q=${encodeURIComponent(trimmed)}&filter=${encodeURIComponent(f)}`
      );
      setResults(data.results ?? []);
      await refetchHistory();
    } catch (err: any) {
      toast({
        title: "Search failed",
        description: err?.message || "Failed to run query search",
        variant: "destructive",
      });
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };

  const handleRecentClick = (pastQuery: string) => {
    setQuery(pastQuery);
    runSearch(pastQuery);
  };

  const handleDeleteRecent = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiRequest("DELETE", `/api/query-search/history/${encodeURIComponent(id)}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/query-search/history"] });
      toast({ title: "Removed from recent searches" });
    } catch (err: any) {
      toast({
        title: "Could not remove",
        description: err?.message ?? "Failed to delete recent search",
        variant: "destructive",
      });
    }
  };

  const showLinkOnly = submittedFilter === "link";

  const getDownloadFileName = (result: QuerySearchResult) =>
    result.source === "local" ? result.fileName : (result.fileName ?? result.title ?? "download");

  const handleDownload = async (result: QuerySearchResult) => {
    if (result.source === "web") {
      window.open(result.fileUrl, "_blank");
      toast({ title: "Opened in new tab", description: "Use the page to save or download if needed." });
      return;
    }
    try {
      const response = await fetch(result.fileUrl);
      if (!response.ok) throw new Error("Failed to download file");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getDownloadFileName(result);
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Download started",
        description: `${result.title} is being downloaded`,
      });
    } catch (err: any) {
      toast({
        title: "Download failed",
        description: err?.message || "Failed to download file",
        variant: "destructive",
      });
    }
  };

  const summaryDisplay = (result: QuerySearchResult) => {
    const raw = result.summaryContent?.trim();
    if (raw) {
      const text = safeText(raw);
      if (text) {
        const maxLen = 280;
        return text.length <= maxLen ? text : text.slice(0, maxLen) + "…";
      }
    }
    if (result.source === "web") return "Snippet from web search.";
    return "No summary generated yet. You can generate one from the Summaries page.";
  };

  const resultKey = (result: QuerySearchResult, index: number) =>
    result.source === "local" ? result.material.id : `web-${index}-${result.fileUrl}`;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <motion.div
        className="mb-8 md:mb-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Search className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="font-heading font-bold text-2xl md:text-4xl">Query Search</h1>
          </div>
        </div>
        <p className="text-muted-foreground text-sm md:text-base ml-14">
          Search your materials and the web. Use filters or dorks in the query.
        </p>
        <Collapsible open={dorksOpen} onOpenChange={setDorksOpen} className="ml-14 mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Dorks & search operators reference
              {dorksOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-3 p-4 border-2 max-w-4xl">
              <p className="text-xs text-muted-foreground mb-3">Use these in your query. Each search is saved in Recent searches.</p>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="font-medium mb-1">File type</p>
                  <ul className="text-muted-foreground space-y-0.5">
                    <li><code className="bg-muted px-1 rounded">filetype:pdf</code> PDF</li>
                    <li><code className="bg-muted px-1 rounded">filetype:doc</code> or <code className="bg-muted px-1 rounded">filetype:docx</code> Word</li>
                    <li><code className="bg-muted px-1 rounded">filetype:ppt</code> or <code className="bg-muted px-1 rounded">filetype:pptx</code> PowerPoint</li>
                    <li><code className="bg-muted px-1 rounded">filetype:xls</code> or <code className="bg-muted px-1 rounded">filetype:xlsx</code> Excel</li>
                    <li><code className="bg-muted px-1 rounded">filetype:txt</code> Text</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Site / URL</p>
                  <ul className="text-muted-foreground space-y-0.5">
                    <li><code className="bg-muted px-1 rounded">site:edu</code> education</li>
                    <li><code className="bg-muted px-1 rounded">site:gov</code> government</li>
                    <li><code className="bg-muted px-1 rounded">site:org</code> organizations</li>
                    <li><code className="bg-muted px-1 rounded">inurl:pdf</code> URL contains pdf</li>
                    <li><code className="bg-muted px-1 rounded">inurl:slides</code> or <code className="bg-muted px-1 rounded">inurl:download</code></li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Content</p>
                  <ul className="text-muted-foreground space-y-0.5">
                    <li><code className="bg-muted px-1 rounded">intitle:keyword</code> word in title</li>
                    <li><code className="bg-muted px-1 rounded">&quot;exact phrase&quot;</code> exact match</li>
                    <li><code className="bg-muted px-1 rounded">-word</code> exclude word</li>
                    <li><code className="bg-muted px-1 rounded">word1 OR word2</code> either word</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Other</p>
                  <ul className="text-muted-foreground space-y-0.5">
                    <li><code className="bg-muted px-1 rounded">after:2020</code> or <code className="bg-muted px-1 rounded">before:2021</code> date</li>
                    <li><code className="bg-muted px-1 rounded">related:example.com</code> similar sites</li>
                    <li><code className="bg-muted px-1 rounded">*</code> wildcard</li>
                  </ul>
                </div>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      </motion.div>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex flex-col sm:flex-row gap-3 max-w-3xl flex-wrap">
          <Input
            type="text"
            placeholder="e.g. modulus, filetype:pdf, site:edu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[200px]"
            disabled={isSearching}
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as WebFilter)} disabled={isSearching}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="pdf">PDF only</SelectItem>
              <SelectItem value="ppt">PPT only</SelectItem>
              <SelectItem value="doc">DOC only</SelectItem>
              <SelectItem value="txt">TXT only</SelectItem>
              <SelectItem value="xls">XLS only</SelectItem>
              <SelectItem value="site_edu">Site: .edu</SelectItem>
              <SelectItem value="site_gov">Site: .gov</SelectItem>
              <SelectItem value="site_org">Site: .org</SelectItem>
              <SelectItem value="inurl_pdf">In URL: pdf</SelectItem>
              <SelectItem value="inurl_download">In URL: download</SelectItem>
              <SelectItem value="link">Link only</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={isSearching} className="sm:w-auto">
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Search
          </Button>
        </div>
      </form>

      {searches.length > 0 && (
        <div className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
            <History className="h-4 w-4" />
            Recent searches (click to run again; X to remove one)
          </h2>
          <div className="flex flex-wrap gap-2">
            {searches.map((s) => (
              <div
                key={s.id}
                className="inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => handleRecentClick(s.query)}
                  disabled={isSearching}
                  className="text-left truncate max-w-[280px] hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring rounded"
                >
                  {safeText(s.query) || "(empty)"}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDeleteRecent(e, s.id)}
                  disabled={isSearching}
                  className="shrink-0 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Remove this search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!submittedQuery && results.length === 0 && !isSearching && (
        <p className="text-muted-foreground text-sm">
          Enter a query above to find materials by topic, file name, or book title.
        </p>
      )}

      {isSearching && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-primary mr-3" />
          <span className="text-muted-foreground">Searching...</span>
        </div>
      )}

      <AnimatePresence mode="wait">
        {!isSearching && submittedQuery && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="py-12"
          >
            <Card className="p-8 text-center border-2 border-dashed">
              <p className="text-muted-foreground">No results for your query.</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different topic or file name. Add SERPER_API_KEY for web results.</p>
            </Card>
          </motion.div>
        )}

        {!isSearching && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground mb-4">
              {results.length} {results.length === 1 ? "result" : "results"} for &quot;{submittedQuery}&quot;
            </p>
            <div className="grid gap-4 md:grid-cols-1">
              {results.map((result, index) => (
                <motion.div
                  key={resultKey(result, index)}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="p-5 md:p-6 border-2 flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                        {result.source === "web" ? (
                          <Globe className="h-5 w-5 text-primary" />
                        ) : (
                          <FileText className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-lg truncate" title={safeText(result.title)}>
                            {safeText(result.title) || "Untitled"}
                          </h3>
                          <Badge variant={result.source === "local" ? "default" : "secondary"} className="shrink-0 text-xs">
                            {result.source === "local" ? "Your file" : "Web"}
                          </Badge>
                        </div>
                        {!showLinkOnly && (
                          <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                            {summaryDisplay(result)}
                          </p>
                        )}
                        {showLinkOnly && (
                          <p className="text-sm text-muted-foreground truncate">
                            <a
                              href={result.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all"
                            >
                              {result.fileUrl}
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <a
                          href={result.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open / Download
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(result)}
                        className="inline-flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {result.source === "web" ? "Open link" : "Download"}
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
