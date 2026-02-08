import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/clerkAuth";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Bot, User, FileText, Sparkles, Loader2, Trash2, RotateCcw } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import type { ChatMessage, StudyMaterial } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";

export default function Chat() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [message, setMessage] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const { data: materials } = useQuery<StudyMaterial[]>({
    queryKey: ["/api/study-materials"],
    enabled: isAuthenticated,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chat/messages", selectedMaterial],
    queryFn: async () => {
      
      const clerk = (window as any).Clerk;
      const token = clerk?.session ? await clerk.session.getToken() : null;
      
      if (!token) {
        throw new Error("Authentication required. Please log in again.");
      }

      const url = selectedMaterial 
        ? `/api/chat/messages?materialId=${selectedMaterial}`
        : "/api/chat/messages";
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      const url = selectedMaterial 
        ? `/api/chat/messages?materialId=${selectedMaterial}`
        : "/api/chat/messages";
      return await apiRequest("DELETE", url);
    },
    onMutate: async () => {
      
      queryClient.setQueryData<ChatMessage[]>(["/api/chat/messages", selectedMaterial], []);
    },
    onSuccess: () => {
      
      queryClient.removeQueries({ 
        queryKey: ["/api/chat/messages"],
        exact: false 
      });
      
      toast({
        title: "Conversation Deleted",
        description: "The chat conversation has been cleared.",
      });
      
      
      setTimeout(() => {
        window.location.reload();
      }, 100);
    },
    onError: (error: Error) => {
      
      queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", selectedMaterial] });
      toast({
        title: "Error",
        description: error.message || "Failed to delete conversation",
        variant: "destructive",
      });
    },
  });

  const sendMessageWithStreaming = async (content: string) => {
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setIsStreaming(true);
    setStreamingMessage("");
    
    
    queryClient.setQueryData<ChatMessage[]>(["/api/chat/messages", selectedMaterial], (oldMessages = []) => {
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        userId: user?.id || "",
        materialId: selectedMaterial,
        role: "user" as const,
        content: content,
        createdAt: new Date(),
      } as ChatMessage;
      return [...oldMessages, optimisticMessage];
    });
    scrollToBottom();
    
    try {
      
      const clerk = (window as any).Clerk;
      const token = clerk?.session ? await clerk.session.getToken() : null;
      
      if (!token) {
        throw new Error("Authentication required. Please log in again.");
      }

      const response = await fetch("/api/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        credentials: "include",
        signal: abortController.signal,
        body: JSON.stringify({
          content,
          materialId: selectedMaterial,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error("No reader available");
      }

      let buffer = "";

      while (true) {
        
        if (abortController.signal.aborted) {
          reader.cancel();
          break;
        }
        
        const { done, value } = await reader.read();
        if (done) break;

        
        buffer += decoder.decode(value, { stream: true });
        
        
        const events = buffer.split("\n\n");
        
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === "userMessage") {
                  
                  queryClient.setQueryData<ChatMessage[]>(["/api/chat/messages", selectedMaterial], (oldMessages = []) => {
                    
                    const filtered = oldMessages.filter(m => !m.id.startsWith("temp-"));
                    return [...filtered, data.message];
                  });
                  scrollToBottom();
                } else if (data.type === "thinking") {
                  
                  setStreamingMessage("");
                } else if (data.type === "chunk") {
                  setStreamingMessage((prev) => prev + data.content);
                  scrollToBottom();
                } else if (data.type === "complete") {
                  setIsStreaming(false);
                  setStreamingMessage("");
                  queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", selectedMaterial] });
                  scrollToBottom();
                } else if (data.type === "error") {
                  throw new Error(data.message);
                }
              } catch (parseError) {
                console.error("Failed to parse SSE data:", line, parseError);
              }
            }
          }
        }
      }
      
      
      if (buffer.trim()) {
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "userMessage") {
                queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", selectedMaterial] });
              } else if (data.type === "complete") {
                setIsStreaming(false);
                setStreamingMessage("");
                queryClient.invalidateQueries({ queryKey: ["/api/chat/messages", selectedMaterial] });
              }
            } catch (parseError) {
              console.error("Failed to parse final SSE data:", line, parseError);
            }
          }
        }
      }
    } catch (error: any) {
      
      if (error.name === 'AbortError') {
        return;
      }
      
      setIsStreaming(false);
      setStreamingMessage("");
      
      if (isUnauthorizedError(error)) {
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
      
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!message.trim()) {
      toast({
        title: "Empty Message",
        description: "Please type a message",
        variant: "destructive",
      });
      return;
    }
    const msg = message;
    setMessage("");
    sendMessageWithStreaming(msg);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <motion.div 
        className="p-3 md:p-4 border-b bg-card/50 backdrop-blur-sm"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
              <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="font-heading font-bold text-lg md:text-2xl" data-testid="text-chat-title">
                AI Study Assistant
              </h1>
              <p className="text-muted-foreground text-xs md:text-sm hidden sm:block" data-testid="text-chat-subtitle">
                Ask questions about your study materials or get general study help
              </p>
            </div>
            {messages && messages.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    data-testid="button-delete-conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this conversation? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteConversationMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 max-w-xs">
              <Select 
                value={selectedMaterial || "general"} 
                onValueChange={(val) => {
                  const newMaterialId = val === "general" ? null : val;
                  setSelectedMaterial(newMaterialId);
                  
                  
                }}
              >
                <SelectTrigger data-testid="select-material" className="border-2 h-9 text-sm">
                  <SelectValue placeholder="Select study material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general" data-testid="option-general">General Questions</SelectItem>
                  {materials?.map((material) => (
                    <SelectItem key={material.id} value={material.id} data-testid={`option-material-${material.id}`}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate text-sm">{material.title}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-4 scrollbar-hide" data-testid="chat-messages-container">
        <div className="max-w-3xl mx-auto space-y-3">
          {messagesLoading ? (
            <div className="text-center py-12">
              <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="mt-4 text-muted-foreground font-medium">Loading messages...</p>
            </div>
          ) : messages && messages.length > 0 ? (
            <AnimatePresence initial={false}>
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.role === "assistant" && (
                    <Avatar className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 ring-2 ring-primary/10">
                      <AvatarImage src="/ai-avatar.png" alt="AI Assistant" />
                      <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10">
                        <Bot className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`rounded-xl px-3 py-2 max-w-[80%] md:max-w-xl shadow-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border-2"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words text-xs md:text-sm leading-relaxed">{msg.content}</p>
                    <p className={`text-[10px] md:text-xs mt-1.5 ${msg.role === "user" ? "opacity-70" : "text-muted-foreground"}`}>
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <Avatar className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 shadow-sm">
                      <AvatarImage src={user?.profileImageUrl || "/user-avatar.png"} alt="User" />
                      <AvatarFallback className="bg-primary">
                        <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </motion.div>
              ))}
              {isStreaming && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2 justify-start"
                >
                  <Avatar className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 ring-2 ring-primary/10">
                    <AvatarImage src="/ai-avatar.png" alt="AI Assistant" />
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10">
                      <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary animate-spin" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="rounded-xl px-3 py-2.5 min-h-[52px] max-w-[80%] md:max-w-xl bg-card border-2 border-primary/20 shadow-sm flex items-center">
                    {streamingMessage ? (
                      <div className="w-full">
                        <p className="whitespace-pre-wrap break-words text-xs md:text-sm leading-relaxed">{streamingMessage}</p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
                          <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse [animation-delay:75ms]" />
                          <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse [animation-delay:150ms]" />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 w-full text-muted-foreground">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                        </div>
                        <span className="text-xs md:text-sm">Thinking...</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          ) : isStreaming ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2 justify-start"
            >
              <Avatar className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 ring-2 ring-primary/10">
                <AvatarImage src="/ai-avatar.png" alt="AI Assistant" />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10">
                  <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary animate-spin" />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-xl px-3 py-2.5 min-h-[52px] max-w-[80%] md:max-w-xl bg-card border-2 border-primary/20 shadow-sm flex items-center">
                <div className="flex items-center gap-2 w-full text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs md:text-sm">Thinking...</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="p-8 md:p-12 text-center border-2 border-dashed" data-testid="card-empty-state">
                <div className="p-4 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 inline-block mb-4">
                  <Bot className="h-12 w-12 md:h-16 md:w-16 text-primary" />
                </div>
                <h3 className="font-heading font-semibold text-lg md:text-xl mb-2">Start a Conversation</h3>
                <p className="text-muted-foreground text-sm md:text-base mb-4 max-w-md mx-auto">
                  {selectedMaterial
                    ? "Ask questions about your selected study material and get instant AI-powered assistance"
                    : "Ask me anything about your studies and I'll help you learn better"}
                </p>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                  <span>Powered by AI</span>
                </div>
              </Card>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <motion.div 
        className="p-3 md:p-4 border-t bg-card/50 backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={selectedMaterial ? "Ask a question about this material..." : "Ask me anything..."}
              className="resize-none border-2 text-xs md:text-sm"
              rows={2}
              disabled={isStreaming}
              data-testid="input-message"
            />
            <Button
              onClick={handleSend}
              disabled={!message.trim() || isStreaming}
              size="icon"
              className="h-full min-w-[40px]"
              data-testid="button-send"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 ml-1">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </motion.div>
    </div>
  );
}
