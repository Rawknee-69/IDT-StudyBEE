import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./clerkAuth";
import multer from "multer";
import { createPartFromUri, GoogleGenAI } from "@google/genai";
// Import Deepgram function - will only fail when actually called if API key is missing
import { generateAudioFromText } from "./deepgram";
// objectStorage and setObjectAclPolicy no longer needed - using UploadThing instead
import { sanitizeMarkdown, sanitizeUserInput, sanitizeForAudio, sanitizeMindMapNode } from "./textUtils";
import { setupCollabWebSocket, notifySessionEnded } from "./collabWebSocket";
import {
  insertStudyMaterialSchema,
  insertFlashcardSchema,
  insertQuizSchema,
  insertQuizAttemptSchema,
  insertMindMapSchema,
  insertSummarySchema,
  insertStudySessionSchema,
  insertTodoSchema,
  insertPomodoroSessionSchema,
  insertChatMessageSchema,
  updateUserProfileSchema,
  insertCollabSessionSchema,
  insertCollabParticipantSchema,
  insertCollabWhiteboardSchema,
  insertCollabActivitySchema,
  chatMessages,
  studyMaterials,
  type ChatMessage,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, asc } from "drizzle-orm";

// Initialize Gemini AI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Setup multer for file uploads (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Upsert user in database if not exists
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      } else {
        // Update user info from Clerk if changed
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User profile routes
  app.patch("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const profileData = updateUserProfileSchema.parse(req.body);
      const updatedUser = await storage.updateUserProfile(userId, profileData);
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating profile:", error);
      res.status(400).json({ message: error.message || "Failed to update profile" });
    }
  });

  // Study Materials routes
  app.get("/api/study-materials", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const materials = await storage.getStudyMaterialsByUser(userId);
      res.json(materials);
    } catch (error) {
      console.error("Error fetching study materials:", error);
      res.status(500).json({ message: "Failed to fetch study materials" });
    }
  });

  app.get("/api/study-materials/:id", isAuthenticated, async (req: any, res) => {
    try {
      const material = await storage.getStudyMaterial(req.params.id);
      if (!material) {
        return res.status(404).json({ message: "Study material not found" });
      }
      // Verify ownership
      if (material.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(material);
    } catch (error) {
      console.error("Error fetching study material:", error);
      res.status(500).json({ message: "Failed to fetch study material" });
    }
  });

  // YouTube Recommendations endpoint with streaming and DB caching
  app.get("/api/resources/youtube-recommendations/:materialId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const materialId = req.params.materialId;
      const regenerate = req.query.regenerate === 'true';
      
      // Get the study material
      const material = await storage.getStudyMaterial(materialId);
      if (!material) {
        return res.status(404).json({ message: "Study material not found" });
      }
      
      // Verify ownership
      if (material.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Set up Server-Sent Events for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Track if client disconnected
      let clientDisconnected = false;
      
      // Listen for client disconnect
      req.on('close', () => {
        clientDisconnected = true;
        console.log(`Client disconnected for material ${materialId}, stopping search`);
      });

      req.on('aborted', () => {
        clientDisconnected = true;
        console.log(`Request aborted for material ${materialId}, stopping search`);
      });

      // Helper to check if we should continue processing
      const shouldContinue = () => {
        if (clientDisconnected) {
          return false;
        }
        // Check if response is still writable
        if (res.destroyed || res.closed) {
          return false;
        }
        return true;
      };

      // Check if we have cached topics and videos (unless regenerating)
      let topics: string[] = [];

      if (!regenerate) {
        // Try to get cached topics
        const cachedTopics = await storage.getMaterialTopics(materialId);
        if (cachedTopics && cachedTopics.topics) {
          topics = cachedTopics.topics as string[];
          console.log(`Using cached topics (${topics.length}) for material ${materialId}`);
        }
      } else {
        // Delete existing cache if regenerating
        await storage.deleteMaterialTopics(materialId);
        await storage.deleteYoutubeRecommendationsByMaterial(materialId);
      }

      // If no cached topics, extract them from PDF
      if (topics.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'status', message: 'Extracting topics from PDF...' })}\n\n`);

        // Get or upload PDF to Gemini File API
        let geminiFileUri: string | null = material.geminiFileUri || null;
        let geminiMimeType: string | null = null;

        if (!geminiFileUri) {
          try {
            const fileUrl = material.fileUrl;
            if (fileUrl) {
              console.log("Uploading PDF to Gemini File API for topic extraction...");
              
              const pdfBuffer = await fetch(fileUrl).then((response) => {
                if (!response.ok) {
                  throw new Error(`Failed to download PDF: ${response.statusText}`);
                }
                return response.arrayBuffer();
              });

              const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
              const file = await genAI.files.upload({
                file: fileBlob,
                config: {
                  displayName: material.fileName || material.title,
                },
              });

              if (!file.name) {
                throw new Error("Failed to get file name from Gemini upload response");
              }
              
              let getFile = await genAI.files.get({ name: file.name });
              while (getFile.state === 'PROCESSING') {
                getFile = await genAI.files.get({ name: file.name });
                await new Promise((resolve) => setTimeout(resolve, 5000));
              }

              if (getFile.state === 'FAILED') {
                throw new Error('File processing failed.');
              }

              geminiFileUri = getFile.uri || file.uri || null;
              geminiMimeType = getFile.mimeType || file.mimeType || 'application/pdf';

              if (!geminiFileUri) {
                throw new Error("Failed to get file URI from Gemini upload response");
              }

              await db.update(studyMaterials)
                .set({ geminiFileUri })
                .where(eq(studyMaterials.id, material.id));
            }
          } catch (uploadError) {
            console.error("Error uploading PDF to Gemini:", uploadError);
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to process PDF' })}\n\n`);
            res.end();
            return;
          }
        } else {
          geminiMimeType = 'application/pdf';
        }

        // Extract topics using Gemini
        const topicExtractionPrompt = `Analyze the attached PDF document and extract all the main topics, concepts, and subjects covered in it. 
      
Return ONLY a JSON array of topic strings, where each topic is a clear, concise description of a main subject or concept from the document.
Focus on educational topics that would benefit from video lectures.
Return the topics as a simple JSON array like: ["Topic 1", "Topic 2", "Topic 3"]
Do not include any additional text, explanations, or markdown formatting - just the JSON array.`;

        const contents: any[] = [topicExtractionPrompt];
        
        if (geminiFileUri && geminiMimeType) {
          const fileContent = createPartFromUri(geminiFileUri, geminiMimeType);
          contents.push(fileContent);
        }

        const topicResult = await genAI.models.generateContent({
          model: "gemini-2.0-flash",
          contents: contents,
        });

        const topicText = topicResult.text || "";
        const jsonMatch = topicText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error("Failed to extract topics from PDF");
        }

        try {
          topics = JSON.parse(jsonMatch[0]);
          if (!Array.isArray(topics) || topics.length === 0) {
            throw new Error("No topics found in PDF");
          }
        } catch (parseError) {
          throw new Error("Failed to parse topics from AI response");
        }

        // Store topics in DB
        await storage.createOrUpdateMaterialTopics({
          materialId,
          topics: topics as any,
        });

        res.write(`data: ${JSON.stringify({ type: 'status', message: `Found ${topics.length} topics. Searching for videos...` })}\n\n`);
      }

      // Helper function to parse duration (ISO 8601 format: PT1H2M10S)
      const parseDuration = (duration: string): number => {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
          const hours = parseInt(match[1] || '0', 10);
          const minutes = parseInt(match[2] || '0', 10);
          const seconds = parseInt(match[3] || '0', 10);
          return hours * 3600 + minutes * 60 + seconds;
        }
        return 0;
      };

      // Helper function to search YouTube without API (web scraping)
      const searchYouTube = async (query: string, retries = 2): Promise<any[]> => {
        for (let i = 0; i <= retries; i++) {
          try {
            // Construct YouTube search URL
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
            
            // Fetch the search page with proper headers to avoid bot detection
            const response = await fetch(searchUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
              },
            });

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const html = await response.text();
            
            // Extract ytInitialData from the HTML
            // YouTube embeds video data in a script tag: var ytInitialData = {...}
            const ytInitialDataMatch = html.match(/var ytInitialData = ({.+?});/s);
            if (!ytInitialDataMatch) {
              // Try alternative pattern
              const altMatch = html.match(/window\["ytInitialData"\] = ({.+?});/s);
              if (!altMatch) {
                throw new Error('Could not find ytInitialData in YouTube page');
              }
              const data = JSON.parse(altMatch[1]);
              return extractVideosFromData(data);
            }

            const data = JSON.parse(ytInitialDataMatch[1]);
            return extractVideosFromData(data);
          } catch (error: any) {
            if (i === retries) {
              console.error(`Error searching YouTube for "${query}":`, error.message);
              return [];
            }
            // Exponential backoff: wait 1s, 2s
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
          }
        }
        return [];
      };

      // Helper function to extract video information from YouTube's embedded data
      const extractVideosFromData = (data: any): any[] => {
        const videos: any[] = [];
        
        try {
          // Try multiple possible data structures (YouTube changes their structure)
          let contents: any[] = [];
          
          // Method 1: Standard structure
          if (data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents) {
            contents = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
          }
          // Method 2: Alternative structure
          else if (data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.richGridRenderer?.contents) {
            contents = data.contents.twoColumnSearchResultsRenderer.primaryContents.richGridRenderer.contents;
          }
          // Method 3: Direct contents
          else if (Array.isArray(data?.contents)) {
            contents = data.contents;
          }
          
          // Recursively search for videoRenderer in the data structure
          const findVideoRenderers = (obj: any, depth = 0): any[] => {
            if (depth > 10) return []; // Prevent infinite recursion
            
            const renderers: any[] = [];
            
            if (obj && typeof obj === 'object') {
              if (obj.videoRenderer) {
                renderers.push(obj.videoRenderer);
              }
              
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  renderers.push(...findVideoRenderers(item, depth + 1));
                }
              } else {
                for (const key in obj) {
                  if (key === 'videoRenderer') {
                    renderers.push(obj[key]);
                  } else {
                    renderers.push(...findVideoRenderers(obj[key], depth + 1));
                  }
                }
              }
            }
            
            return renderers;
          };
          
          const videoRenderers = findVideoRenderers(contents);
          
          for (const videoRenderer of videoRenderers) {
            if (!videoRenderer || !videoRenderer.videoId) continue;
            
            const videoId = videoRenderer.videoId;
            
            // Validate video ID format (must be 11 characters, alphanumeric + _ and -)
            if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
              console.warn(`Invalid video ID format: ${videoId}`);
              continue;
            }
            
            // Skip if video is marked as unavailable or private
            if (videoRenderer.unplayableText || videoRenderer.thumbnailOverlays?.some((overlay: any) => 
              overlay.thumbnailOverlayUnplayableStatusRenderer)) {
              continue;
            }
            
            const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText || '';
            const channelTitle = videoRenderer.ownerText?.runs?.[0]?.text || videoRenderer.channelName?.simpleText || '';
            
            // Skip if no title (likely invalid)
            if (!title || title.trim().length === 0) {
              continue;
            }
            
            // Get thumbnail (prefer high quality)
            let thumbnail = '';
            if (videoRenderer.thumbnail?.thumbnails?.length > 0) {
              thumbnail = videoRenderer.thumbnail.thumbnails[videoRenderer.thumbnail.thumbnails.length - 1]?.url || '';
            }
            
            // Parse duration from lengthText (e.g., "10:30" or "1:23:45")
            const lengthText = videoRenderer.lengthText?.simpleText || '';
            let durationSeconds = 0;
            if (lengthText) {
              const parts = lengthText.split(':').map(Number).filter((n: number) => !isNaN(n));
              if (parts.length === 2) {
                durationSeconds = parts[0] * 60 + parts[1];
              } else if (parts.length === 3) {
                durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
              }
            }

            // Get view count if available
            const viewCountText = videoRenderer.viewCountText?.simpleText || 
                                 videoRenderer.viewCountText?.runs?.[0]?.text || 
                                 videoRenderer.shortViewCountText?.simpleText || 
                                 '0';
            const viewCount = parseViewCount(viewCountText);

            // Get description
            const description = videoRenderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || 
                               videoRenderer.descriptionSnippet?.simpleText || 
                               '';

            videos.push({
              videoId,
              title,
              channelTitle,
              thumbnail,
              duration: durationSeconds,
              viewCount,
              description,
            });
          }
        } catch (error) {
          console.error('Error extracting videos from YouTube data:', error);
        }
        
        return videos;
      };

      // Helper function to parse view count (e.g., "1.2M views" -> 1200000)
      const parseViewCount = (text: string): number => {
        const clean = text.replace(/[^0-9.,KMkm]/g, '');
        if (!clean) return 0;
        
        const num = parseFloat(clean.replace(/,/g, ''));
        if (text.toLowerCase().includes('k')) {
          return Math.floor(num * 1000);
        } else if (text.toLowerCase().includes('m')) {
          return Math.floor(num * 1000000);
        } else if (text.toLowerCase().includes('b')) {
          return Math.floor(num * 1000000000);
        }
        return Math.floor(num);
      };

      // Helper function to validate video ID and check if video is available
      const validateVideoId = async (videoId: string): Promise<boolean> => {
        try {
          // Validate video ID format (YouTube IDs are 11 characters)
          if (!videoId || videoId.length !== 11 || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
            return false;
          }

          // Check video availability using YouTube's oEmbed endpoint (no API key needed)
          // This is a lightweight check that doesn't count against API quota
          const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          
          // Create abort controller for timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(oEmbedUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json',
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            // 404 or other errors mean video is unavailable
            return false;
          }

          // Try to parse the response to ensure it's valid
          const data = await response.json();
          return !!(data && data.html);
        } catch (error: any) {
          // Timeout or network errors - assume video might be available but skip validation
          if (error.name === 'AbortError' || error.name === 'TimeoutError') {
            console.warn(`Timeout validating video ${videoId}, skipping validation`);
            // Return true to allow the video through if validation times out
            return true;
          }
          console.error(`Error validating video ${videoId}:`, error.message);
          return false;
        }
      };

      // Helper function to calculate relevance score between topic and video
      const calculateRelevance = (topic: string, videoTitle: string, videoDescription: string): number => {
        const topicLower = topic.toLowerCase();
        const titleLower = videoTitle.toLowerCase();
        const descLower = videoDescription.toLowerCase();
        
        // Extract key terms from topic (remove common words)
        const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from'];
        const topicWords = topicLower
          .split(/[\s,()]+/)
          .filter(word => word.length > 2 && !commonWords.includes(word));
        
        let score = 0;
        let matches = 0;
        
        for (const word of topicWords) {
          if (titleLower.includes(word)) {
            score += 3; // Title matches are more important
            matches++;
          } else if (descLower.includes(word)) {
            score += 1; // Description matches are less important
            matches++;
          }
        }
        
        // Bonus for exact phrase match
        if (titleLower.includes(topicLower) || descLower.includes(topicLower)) {
          score += 5;
        }
        
        // Normalize by topic word count
        const normalizedScore = topicWords.length > 0 ? (score / topicWords.length) : 0;
        
        return normalizedScore;
      };

      // Step 1: Check cache and collect topics that need searching
      const topicsToSearch: string[] = [];
      const cachedRecsMap: Map<string, any> = new Map();

      for (const topic of topics) {
        if (!regenerate) {
          const existing = await storage.getYoutubeRecommendationByTopic(materialId, topic);
          if (existing) {
            const cachedRec = {
              topic: existing.topic,
              videoId: existing.videoId,
              title: existing.title,
              channelTitle: existing.channelTitle,
              thumbnail: existing.thumbnail,
              description: existing.description || "",
            };
            cachedRecsMap.set(topic, cachedRec);
            // Send cached recommendation immediately
            res.write(`data: ${JSON.stringify({ type: 'video', recommendation: cachedRec })}\n\n`);
            continue;
          }
        }
        topicsToSearch.push(topic);
      }

      // If all topics are cached, we're done
      if (topicsToSearch.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify({ type: 'status', message: `Searching for ${topicsToSearch.length} topics...` })}\n\n`);

      // Step 2: Perform searches using web scraping (no API calls!)
      const topicToVideo: Map<string, any> = new Map();
      
      for (let i = 0; i < topicsToSearch.length; i++) {
        // Check if client disconnected before processing each topic
        if (!shouldContinue()) {
          console.log('Stopping search - client disconnected');
          break;
        }

        const topic = topicsToSearch[i];
        try {
          // Add delay between requests to be respectful (500ms delay)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
            // Check again after delay
            if (!shouldContinue()) {
              break;
            }
          }

          // Build more specific search query with context from material title
          // Include material title context if available to improve relevance
          const materialContext = material.title ? ` ${material.title}` : '';
          const searchQuery = `${topic}${materialContext} lecture tutorial educational course explanation`;
          
          if (shouldContinue()) {
            res.write(`data: ${JSON.stringify({ type: 'status', message: `Searching for: ${topic}...` })}\n\n`);
          }
          
          const videos = await searchYouTube(searchQuery);
          
          // Check again after search
          if (!shouldContinue()) {
            break;
          }
          
          if (videos && videos.length > 0) {
            // Filter and score videos for relevance
            const validVideos: Array<{ video: any; relevance: number; score: number }> = [];
            
            for (const video of videos) {
              // Only consider long-form videos (>60 seconds)
              if (video.duration <= 60) continue;
              
              // Validate video ID
              const isValid = await validateVideoId(video.videoId);
              if (!isValid) {
                console.warn(`Skipping invalid/unavailable video: ${video.videoId}`);
                continue;
              }
              
              // Calculate relevance score
              const relevance = calculateRelevance(topic, video.title, video.description);
              
              // Combined score: relevance (70%) + view count normalized (30%)
              // Normalize view count (assume max 10M views for normalization)
              const normalizedViews = Math.min(video.viewCount / 10000000, 1) * 30;
              const combinedScore = (relevance * 70) + normalizedViews;
              
              validVideos.push({
                video,
                relevance,
                score: combinedScore,
              });
            }

            // Sort by combined score and select the best one
            validVideos.sort((a, b) => b.score - a.score);
            
            // Only use videos with minimum relevance (at least 1 matching word)
            const bestMatch = validVideos.find(v => v.relevance > 0);
            
            if (bestMatch) {
              const bestVideo = bestMatch.video;
              topicToVideo.set(topic, bestVideo);
              
              // Check if client is still connected before storing and sending
              if (!shouldContinue()) {
                break;
              }

              // Send immediately (lazy loading)
              const recommendation = {
                topic: topic,
                videoId: bestVideo.videoId,
                title: bestVideo.title,
                channelTitle: bestVideo.channelTitle,
                thumbnail: bestVideo.thumbnail,
                description: bestVideo.description || "",
              };

              // Store in DB (only if client still connected)
              try {
                await storage.createYoutubeRecommendation({
                  materialId,
                  topic: topic,
                  videoId: bestVideo.videoId,
                  title: bestVideo.title,
                  channelTitle: bestVideo.channelTitle,
                  thumbnail: bestVideo.thumbnail,
                  description: bestVideo.description || "",
                  viewCount: bestVideo.viewCount,
                  duration: bestVideo.duration,
                });

                if (shouldContinue()) {
                  res.write(`data: ${JSON.stringify({ type: 'video', recommendation })}\n\n`);
                }
              } catch (dbError) {
                console.error(`Error storing recommendation for topic "${topic}":`, dbError);
              }
            } else {
              console.warn(`No relevant videos found for topic: ${topic}`);
            }
          }
        } catch (error: any) {
          // Don't log if client disconnected
          if (!clientDisconnected) {
            console.error(`Error searching YouTube for topic "${topic}":`, error.message);
          }
          // Continue with other topics only if client still connected
          if (!shouldContinue()) {
            break;
          }
        }
      }

      // Only send complete if client is still connected
      if (shouldContinue()) {
        res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
        res.end();
      } else {
        // Client disconnected, just end the response
        res.end();
      }
    } catch (error: any) {
      console.error("Error generating YouTube recommendations:", error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message || "Failed to generate YouTube recommendations" })}\n\n`);
      res.end();
    }
  });

  app.post("/api/study-materials/upload", isAuthenticated, upload.single("file"), async (req: any, res) => {
    try {
      const userId = req.user.id;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "Only PDF files are allowed" });
      }

      // Ensure user exists in database before creating study material
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      }

      // Use UploadThing for file storage
      const { utapi } = await import("./uploadthing");
      
      if (!utapi) {
        throw new Error("UploadThing not configured. Please set UPLOADTHING_TOKEN in .env");
      }

      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      // Create a File object for UploadThing
      // File is available in Node.js 18+ globally
      const fileForUpload = new File([file.buffer], sanitizedFilename, { 
        type: file.mimetype,
        lastModified: Date.now(),
      });
      
      // Upload file to UploadThing
      // uploadFiles returns a single result for single file, array for multiple
      const uploadResult = await utapi.uploadFiles(fileForUpload);

      // Use ufsUrl instead of url (deprecated in v9)
      const fileUrl = uploadResult?.data?.ufsUrl || uploadResult?.data?.url;
      
      if (!uploadResult || !uploadResult.data || !fileUrl) {
        throw new Error("File failed to upload to UploadThing");
      }

      // Extract PDF text for AI context (async, don't block upload)
      let extractedText: string | null = null;
      try {
        // Use dynamic import with proper handling for pdf-parse
        const pdfParseModule = await import("pdf-parse");
        const pdfParse = (pdfParseModule as any).default || pdfParseModule;
        if (pdfParse && typeof pdfParse === 'function') {
          const pdfData = await pdfParse(file.buffer);
          extractedText = pdfData?.text || "";
          // Limit to first 100k characters to avoid token limits
          if (extractedText && extractedText.length > 100000) {
            extractedText = extractedText.substring(0, 100000) + "... [truncated]";
          }
        }
      } catch (pdfError) {
        console.error("Error extracting PDF text:", pdfError);
        // Continue without extracted text - can be extracted later
      }

      const material = await storage.createStudyMaterial({
        userId,
        title: file.originalname.replace(".pdf", ""),
        fileName: file.originalname,
        fileUrl: fileUrl,
        fileSize: file.size,
        extractedText: extractedText || undefined,
      });

      res.json(material);
    } catch (error: any) {
      console.error("Error uploading study material:", error);
      res.status(500).json({ message: error.message || "Failed to upload study material" });
    }
  });

  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    // For UploadThing, files are accessed directly via their URLs
    // This route is kept for backward compatibility but redirects to the stored URL
    // In practice, files stored via UploadThing should be accessed directly via their URLs
    return res.status(404).json({ message: "File not found. Files are accessed via their UploadThing URLs." });
  });

  app.delete("/api/study-materials/:id", isAuthenticated, async (req: any, res) => {
    try {
      const material = await storage.getStudyMaterial(req.params.id);
      if (!material) {
        return res.status(404).json({ message: "Study material not found" });
      }
      // Verify ownership
      if (material.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteStudyMaterial(req.params.id);
      res.json({ message: "Study material deleted successfully" });
    } catch (error) {
      console.error("Error deleting study material:", error);
      res.status(500).json({ message: "Failed to delete study material" });
    }
  });

  // Flashcard routes
  app.get("/api/flashcards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.query;
      
      const flashcards = materialId
        ? await storage.getFlashcardsByMaterial(materialId as string)
        : await storage.getFlashcardsByUser(userId);
      
      res.json(flashcards);
    } catch (error) {
      console.error("Error fetching flashcards:", error);
      res.status(500).json({ message: "Failed to fetch flashcards" });
    }
  });

  app.post("/api/flashcards/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId, count = 10 } = req.body;

      const material = await storage.getStudyMaterial(materialId);
      if (!material || material.userId !== userId) {
        return res.status(404).json({ message: "Study material not found" });
      }

      // Use Gemini to generate flashcards
      const prompt = `Generate ${count} flashcards from this study material titled "${material.title}". 
      Return ONLY a JSON array with objects containing 'question' and 'answer' fields. No additional text or markdown formatting.
      Use plain text only - no asterisks, underscores, or markdown syntax.
      Example format: [{"question": "What is X?", "answer": "X is..."}, ...]`;

      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });
      const text = result.text || "";
      
      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Failed to parse AI response");
      }
      
      const flashcardsData = JSON.parse(jsonMatch[0]);

      // Save flashcards to database with sanitized content
      const createdFlashcards = [];
      for (const card of flashcardsData) {
        const flashcard = await storage.createFlashcard({
          userId,
          materialId,
          question: sanitizeMarkdown(card.question || ""),
          answer: sanitizeMarkdown(card.answer || ""),
          isAIGenerated: true,
        });
        createdFlashcards.push(flashcard);
      }

      res.json(createdFlashcards);
    } catch (error: any) {
      console.error("Error generating flashcards:", error);
      res.status(500).json({ message: error.message || "Failed to generate flashcards" });
    }
  });

  app.post("/api/flashcards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const flashcardData = insertFlashcardSchema.parse({ ...req.body, userId });
      const flashcard = await storage.createFlashcard(flashcardData);
      res.json(flashcard);
    } catch (error: any) {
      console.error("Error creating flashcard:", error);
      res.status(400).json({ message: error.message || "Failed to create flashcard" });
    }
  });

  app.delete("/api/flashcards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const flashcard = await storage.getFlashcard(req.params.id);
      if (!flashcard || flashcard.userId !== req.user.id) {
        return res.status(404).json({ message: "Flashcard not found" });
      }
      await storage.deleteFlashcard(req.params.id);
      res.json({ message: "Flashcard deleted successfully" });
    } catch (error) {
      console.error("Error deleting flashcard:", error);
      res.status(500).json({ message: "Failed to delete flashcard" });
    }
  });

  // Quiz routes
  app.get("/api/quizzes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.query;
      
      const quizzes = materialId
        ? await storage.getQuizzesByMaterial(materialId as string)
        : await storage.getQuizzesByUser(userId);
      
      res.json(quizzes);
    } catch (error) {
      console.error("Error fetching quizzes:", error);
      res.status(500).json({ message: "Failed to fetch quizzes" });
    }
  });

  app.get("/api/quizzes/:id", isAuthenticated, async (req: any, res) => {
    try {
      const quiz = await storage.getQuiz(req.params.id);
      if (!quiz || quiz.userId !== req.user.id) {
        return res.status(404).json({ message: "Quiz not found" });
      }
      res.json(quiz);
    } catch (error) {
      console.error("Error fetching quiz:", error);
      res.status(500).json({ message: "Failed to fetch quiz" });
    }
  });

  app.post("/api/quizzes/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId, questionCount = 10 } = req.body;

      const material = await storage.getStudyMaterial(materialId);
      if (!material || material.userId !== userId) {
        return res.status(404).json({ message: "Study material not found" });
      }

      // Get or upload PDF to Gemini File API (same logic as chat endpoint)
      let geminiFileUri: string | null = material.geminiFileUri || null;
      let geminiMimeType: string | null = null;
      
      // If we don't have a Gemini file URI, upload the PDF now
      if (!geminiFileUri) {
        try {
          const fileUrl = material.fileUrl;
          if (fileUrl) {
            console.log("Uploading PDF to Gemini File API for quiz generation...");
            
            // Download PDF from UploadThing
            const pdfBuffer = await fetch(fileUrl).then((response) => {
              if (!response.ok) {
                throw new Error(`Failed to download PDF: ${response.statusText}`);
              }
              return response.arrayBuffer();
            });

            // Create a Blob from the PDF buffer
            const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

            // Upload to Gemini File API
            const file = await genAI.files.upload({
              file: fileBlob,
              config: {
                displayName: material.fileName || material.title,
              },
            });

            // Wait for the file to be processed
            if (!file.name) {
              throw new Error("Failed to get file name from Gemini upload response");
            }
            
            let getFile = await genAI.files.get({ name: file.name });
            while (getFile.state === 'PROCESSING') {
              getFile = await genAI.files.get({ name: file.name });
              console.log(`Current file status: ${getFile.state}`);
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }

            if (getFile.state === 'FAILED') {
              throw new Error('File processing failed.');
            }

            geminiFileUri = getFile.uri || file.uri || null;
            geminiMimeType = getFile.mimeType || file.mimeType || 'application/pdf';

            if (!geminiFileUri) {
              throw new Error("Failed to get file URI from Gemini upload response");
            }

            // Store the Gemini file URI in the database
            await db.update(studyMaterials)
              .set({ geminiFileUri })
              .where(eq(studyMaterials.id, material.id));
            console.log("PDF uploaded to Gemini successfully for quiz generation, file URI:", geminiFileUri);
          }
        } catch (uploadError) {
          console.error("Error uploading PDF to Gemini for quiz generation:", uploadError);
          return res.status(500).json({ 
            message: "Failed to process PDF. Please ensure the PDF file is accessible." 
          });
        }
      } else {
        geminiMimeType = 'application/pdf';
        console.log("Using existing Gemini file URI for quiz generation:", geminiFileUri);
        
        // Verify the file is still accessible and ready
        try {
          if (geminiFileUri) {
            // Extract file name from URI (format: files/xxx)
            const fileNameMatch = geminiFileUri.match(/files\/([^\/]+)/);
            if (fileNameMatch) {
              const fileName = fileNameMatch[1];
              const fileStatus = await genAI.files.get({ name: fileName });
              console.log("File status check:", fileStatus.state);
              if (fileStatus.state === 'FAILED') {
                throw new Error('File processing failed. Please re-upload the PDF.');
              }
            }
          }
        } catch (verifyError) {
          console.error("Error verifying file status:", verifyError);
          // Continue anyway - file might still be accessible
        }
      }

      // Build prompt with explicit PDF file reference
      const prompt = `You are analyzing the attached PDF document. Based ONLY on the content of this PDF, generate ${questionCount} multiple choice quiz questions that test understanding of the key concepts, facts, and information presented in the document.

IMPORTANT: 
- All questions MUST be based on the actual content in the attached PDF
- Do NOT generate random or generic questions
- Focus on specific details, facts, and concepts from the document
- Return ONLY a JSON array with objects containing 'question', 'options' (array of 4 choices), and 'correctAnswer' (the correct option text)
- No additional text or markdown formatting
- Use plain text only - no asterisks, underscores, or markdown syntax

Example format: [{"question": "What is X?", "options": ["A", "B", "C", "D"], "correctAnswer": "A"}, ...]`;

      // Prepare contents array - simple format matching chat endpoint exactly
      const contents: any[] = [];
      
      // Add prompt first
      contents.push(prompt);
      
      // Add PDF file reference using createPartFromUri (same as chat endpoint)
      if (geminiFileUri && geminiMimeType) {
        console.log("Adding PDF file to quiz generation request, URI:", geminiFileUri);
        const fileContent = createPartFromUri(geminiFileUri, geminiMimeType);
        contents.push(fileContent);
        console.log("Quiz generation contents array: prompt + file (2 items)");
      } else {
        console.error("WARNING: No Gemini file URI available for quiz generation!");
        console.log("Quiz generation contents array: prompt only (1 item)");
      }

      // Use Gemini to generate quiz with PDF content
      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: contents,
      });
      const text = result.text || "";
      
      // Extract JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Failed to parse AI response");
      }
      
      const questions = JSON.parse(jsonMatch[0]);

      // Sanitize quiz questions and options
      const sanitizedQuestions = questions.map((q: any) => ({
        question: sanitizeMarkdown(q.question || ""),
        options: (q.options || []).map((opt: string) => sanitizeMarkdown(opt)),
        correctAnswer: sanitizeMarkdown(q.correctAnswer || ""),
      }));

      // Save quiz to database
      const quiz = await storage.createQuiz({
        userId,
        materialId,
        title: `${material.title} Quiz`,
        questions: sanitizedQuestions,
        isAIGenerated: true,
      });

      res.json(quiz);
    } catch (error: any) {
      console.error("Error generating quiz:", error);
      res.status(500).json({ message: error.message || "Failed to generate quiz" });
    }
  });

  // Quiz Attempt routes
  app.get("/api/quiz-attempts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const attempts = await storage.getQuizAttemptsByUser(userId);
      res.json(attempts);
    } catch (error) {
      console.error("Error fetching quiz attempts:", error);
      res.status(500).json({ message: "Failed to fetch quiz attempts" });
    }
  });

  app.post("/api/quiz-attempts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const attemptData = insertQuizAttemptSchema.parse({ ...req.body, userId });
      
      const attempt = await storage.createQuizAttempt(attemptData);

      // Update user quiz stats if not cancelled
      if (!attemptData.isCancelled) {
        const user = await storage.getUser(userId);
        if (user) {
          await storage.updateUserStats(userId, {
            totalQuizScore: user.totalQuizScore + attemptData.score,
            quizzesCompleted: user.quizzesCompleted + 1,
          });
        }
      }

      res.json(attempt);
    } catch (error: any) {
      console.error("Error creating quiz attempt:", error);
      res.status(400).json({ message: error.message || "Failed to create quiz attempt" });
    }
  });

  // Summary routes
  app.get("/api/summaries", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.query;
      
      if (materialId) {
        const summary = await storage.getSummaryByMaterial(materialId as string);
        res.json(summary || null);
      } else {
        const summaries = await storage.getSummariesByUser(userId);
        res.json(summaries);
      }
    } catch (error) {
      console.error("Error fetching summaries:", error);
      res.status(500).json({ message: "Failed to fetch summaries" });
    }
  });

  app.post("/api/summaries/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.body;

      const material = await storage.getStudyMaterial(materialId);
      if (!material || material.userId !== userId) {
        return res.status(404).json({ message: "Study material not found" });
      }

      // Check if summary already exists
      const existingSummary = await storage.getSummaryByMaterial(materialId);
      if (existingSummary && existingSummary.audioUrl) {
        // Summary with audio already exists, return it
        return res.json(existingSummary);
      }
      
      // If summary exists but no audio, we'll regenerate both for consistency
      let content = "";
      if (existingSummary) {
        // Sanitize existing content in case it has old markdown
        content = sanitizeMarkdown(existingSummary.content);
      } else {

        // Use Gemini to generate an educational summary with examples
        const prompt = `You are an expert tutor helping a student understand the study material titled "${material.title}".

Generate a comprehensive educational summary that:
1. Explains the main concepts in simple, everyday language
2. Provides real-world examples to illustrate difficult concepts
3. Uses analogies and metaphors to make complex ideas easy to understand
4. Breaks down challenging topics step-by-step
5. Includes practical applications of the concepts

Make the explanation engaging and conversational, as if you're speaking directly to the student.
Format the summary to be clear and well-organized with headings and sections.

IMPORTANT: 
- Use plain text only. Do not use markdown formatting like asterisks, underscores, or special characters for emphasis.
- If the content includes mathematical formulas, symbols, or equations, ALWAYS spell them out in words so they sound natural when spoken aloud.
- For example, write "alpha" instead of "α", "sum" instead of "∑", "pi" instead of "π"
- Write "x equals 2" instead of "x = 2", "x squared" instead of "x²"
- Make all mathematical content readable and understandable when spoken.

Your goal is to ensure that even the most difficult concepts become easy to understand through your explanations and examples.`;

        const result = await genAI.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt,
        });
        content = sanitizeMarkdown(result.text || "");
      }

      // Generate audio from the summary using Deepgram
      // Text will be automatically chunked if it exceeds Deepgram's 2000 char limit
      let audioUrl: string | null = null;
      
      // Only generate audio if Deepgram API key is configured
      if (process.env.DEEPGRAM_API_KEY && process.env.DEEPGRAM_API_KEY !== "your_deepgram_api_key_here") {
        try {
          console.log("Generating audio summary with Deepgram...");
          
          // Sanitize content for audio - removes markdown and converts symbols to readable text
          const audioText = sanitizeForAudio(content);
          console.log("Text sanitized for audio, length:", audioText.length);
          
          const audioBuffer = await generateAudioFromText({ 
            text: audioText,
            model: "aura-asteria-en" // Natural, clear voice for educational content
          });

          console.log("Audio buffer generated, size:", audioBuffer.length, "bytes");

          // Upload audio to UploadThing
          const audioFileName = `audio_${materialId}_${Date.now()}.wav`;
          console.log("Uploading audio to UploadThing:", audioFileName);
          
          const { utapi } = await import("./uploadthing");
          if (!utapi) {
            throw new Error("UploadThing not configured");
          }
          
          // Create a File object for UploadThing
          const fileForUpload = new File([audioBuffer], audioFileName, { 
            type: "audio/wav",
            lastModified: Date.now(),
          });
          
          const uploadResult = await utapi.uploadFiles(fileForUpload);
          
          // Use ufsUrl instead of url (deprecated in v9)
          const uploadedUrl = uploadResult?.data?.ufsUrl || uploadResult?.data?.url;
          
          if (!uploadResult || !uploadResult.data || !uploadedUrl) {
            throw new Error("Failed to upload audio to UploadThing");
          }
          
          audioUrl = uploadedUrl;
          console.log("Audio summary generated and uploaded:", audioUrl);
        } catch (audioError) {
          console.error("Error generating audio summary:", audioError);
          console.error("Audio error stack:", audioError instanceof Error ? audioError.stack : "");
          // Continue without audio if generation fails
        }
      } else {
        console.log("Deepgram API key not configured, skipping audio generation");
      }

      // Save or update summary in database with audio URL
      let summary;
      if (existingSummary) {
        // Update existing summary with audio URL
        summary = await storage.updateSummary(existingSummary.id, { audioUrl });
      } else {
        // Create new summary
        summary = await storage.createSummary({
          userId,
          materialId,
          content,
          audioUrl,
        });
      }

      res.json(summary);
    } catch (error: any) {
      console.error("Error generating summary:", error);
      res.status(500).json({ message: error.message || "Failed to generate summary" });
    }
  });

  // Mind Map routes
  app.get("/api/mind-maps", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.query;
      
      const mindMaps = materialId
        ? await storage.getMindMapsByMaterial(materialId as string)
        : await storage.getMindMapsByUser(userId);
      
      res.json(mindMaps);
    } catch (error) {
      console.error("Error fetching mind maps:", error);
      res.status(500).json({ message: "Failed to fetch mind maps" });
    }
  });

  app.post("/api/mind-maps/generate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.body;

      const material = await storage.getStudyMaterial(materialId);
      if (!material || material.userId !== userId) {
        return res.status(404).json({ message: "Study material not found" });
      }

      // Use Gemini to generate mind map structure
      const prompt = `Generate a mind map structure for this study material titled "${material.title}". 
      Return ONLY a JSON object with a hierarchical node structure. Each node should have 'id', 'label', and 'children' (array of child nodes).
      Use plain text only for labels - no asterisks, underscores, or markdown syntax.
      Example: {"id": "root", "label": "Main Topic", "children": [{"id": "1", "label": "Subtopic 1", "children": []}, ...]}`;

      const result = await genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });
      const text = result.text || "";
      
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse AI response");
      }
      
      const mindMapContent = JSON.parse(jsonMatch[0]);

      // Recursively sanitize node labels
      const sanitizedContent = sanitizeMindMapNode(mindMapContent);

      // Save mind map to database
      const mindMap = await storage.createMindMap({
        userId,
        materialId,
        title: `${material.title} Mind Map`,
        content: sanitizedContent,
      });

      res.json(mindMap);
    } catch (error: any) {
      console.error("Error generating mind map:", error);
      res.status(500).json({ message: error.message || "Failed to generate mind map" });
    }
  });

  // Chat routes
  app.get("/api/chat/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.query;
      
      // Completely isolated sessions:
      // - Material-specific chat: only get messages for that material
      // - General chat: only get messages where materialId IS NULL
      let messages: ChatMessage[];
      if (materialId) {
        // Material-specific chat - only this material's messages
        messages = await storage.getChatMessagesByMaterial(materialId as string);
      } else {
        // General chat - only messages without materialId (completely separate)
        messages = await db
          .select()
          .from(chatMessages)
          .where(and(
            eq(chatMessages.userId, userId),
            isNull(chatMessages.materialId)
          ))
          .orderBy(asc(chatMessages.createdAt));
      }
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.delete("/api/chat/messages", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId } = req.query;
      
      if (materialId) {
        // Delete ALL messages for a specific material (including context messages)
        await storage.deleteChatMessagesByMaterial(materialId as string);
      } else {
        // Delete all user messages (general conversation) - delete ALL messages without materialId
        await db.delete(chatMessages)
          .where(and(
            eq(chatMessages.userId, userId),
            isNull(chatMessages.materialId)
          ));
      }
      
      res.json({ message: "Conversation deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting chat messages:", error);
      res.status(500).json({ message: error.message || "Failed to delete conversation" });
    }
  });

  // Removed initialize-context endpoint - file upload is now handled automatically in chat message endpoint

  app.post("/api/chat/message", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { materialId, content } = req.body;

      // Sanitize user input
      const sanitizedContent = sanitizeUserInput(content);

      // Save user message
      const userMessage = await storage.createChatMessage({
        userId,
        materialId: materialId || null,
        role: "user",
        content: sanitizedContent,
      });

      // Set up SSE headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Get conversation history - completely isolated sessions
      // General chat (materialId = null) only gets general messages
      // Material-specific chat only gets that material's messages
      let history: ChatMessage[] = [];
      if (materialId) {
        // Material-specific chat - only get messages for this specific material
        history = await storage.getChatMessagesByMaterial(materialId);
      } else {
        // General chat - only get messages where materialId IS NULL
        history = await db
          .select()
          .from(chatMessages)
          .where(and(
            eq(chatMessages.userId, userId),
            isNull(chatMessages.materialId)
          ))
          .orderBy(asc(chatMessages.createdAt));
      }

      // Get material and upload/retrieve Gemini file URI
      let geminiFileUri: string | null = null;
      let geminiMimeType: string | null = null;
      let material: any = null;
      
      if (materialId) {
        material = await storage.getStudyMaterial(materialId);
        if (material) {
          geminiFileUri = material.geminiFileUri || null;
          
          // If we don't have a Gemini file URI, upload the PDF now
          if (!geminiFileUri) {
            try {
              const fileUrl = material.fileUrl;
              if (fileUrl) {
                console.log("Uploading PDF to Gemini File API...");
                
                // Download PDF from UploadThing
                const pdfBuffer = await fetch(fileUrl).then((response) => {
                  if (!response.ok) {
                    throw new Error(`Failed to download PDF: ${response.statusText}`);
                  }
                  return response.arrayBuffer();
                });

                // Create a Blob from the PDF buffer
                const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });

                // Upload to Gemini File API
                const file = await genAI.files.upload({
                  file: fileBlob,
                  config: {
                    displayName: material.fileName || material.title,
                  },
                });

                // Wait for the file to be processed
                if (!file.name) {
                  throw new Error("Failed to get file name from Gemini upload response");
                }
                
                let getFile = await genAI.files.get({ name: file.name });
                while (getFile.state === 'PROCESSING') {
                  getFile = await genAI.files.get({ name: file.name });
                  console.log(`Current file status: ${getFile.state}`);
                  await new Promise((resolve) => setTimeout(resolve, 5000));
                }

                if (getFile.state === 'FAILED') {
                  throw new Error('File processing failed.');
                }

                geminiFileUri = getFile.uri || file.uri || null;
                geminiMimeType = getFile.mimeType || file.mimeType || 'application/pdf';

                if (!geminiFileUri) {
                  throw new Error("Failed to get file URI from Gemini upload response");
                }

                // Store the Gemini file URI in the database
                await db.update(studyMaterials)
                  .set({ geminiFileUri })
                  .where(eq(studyMaterials.id, material.id));
                console.log("PDF uploaded to Gemini successfully, file URI:", geminiFileUri);
              }
            } catch (uploadError) {
              console.error("Error uploading PDF to Gemini:", uploadError);
              // Continue without PDF if upload fails - user will get an error message
            }
          } else {
            geminiMimeType = 'application/pdf';
            console.log("Using existing Gemini file URI:", geminiFileUri);
          }
        }
      }

      // Build conversation history for Gemini - simple array format matching reference code
      const contents: any[] = [];
      
      // Add conversation history (simple string format for streaming)
      const recentHistory = history.slice(-15); // Get last 15 messages
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          contents.push(msg.content);
        }
      }
      
      // Add current user message with file reference if we have a material
      // Always include file in every message to ensure Gemini has access to it
      if (materialId && geminiFileUri && material && geminiMimeType) {
        // Include user's question
        contents.push(sanitizedContent);
        // Include file reference using createPartFromUri (matching reference code)
        console.log("Adding file to message, URI:", geminiFileUri);
        const fileContent = createPartFromUri(geminiFileUri, geminiMimeType);
        contents.push(fileContent);
      } else {
        // Regular message without file
        contents.push(sanitizedContent);
      }
      
      console.log("Final contents array for streaming:", contents.length, "items", 
        materialId ? `(with material: ${material?.title})` : "(no material)");

      // Send user message ID first
      res.write(`data: ${JSON.stringify({ type: "userMessage", message: userMessage })}\n\n`);

      // Send "thinking" event to show loading state
      res.write(`data: ${JSON.stringify({ type: "thinking" })}\n\n`);

      let fullResponse = "";
      
      // Stream the AI response using conversation history
      // For streaming with file references, use the simple array format (matching reference code)
      let stream;
      if (contents.length > 0) {
        // Use the contents array directly (simple format for file references)
        stream = await genAI.models.generateContentStream({
          model: "gemini-2.0-flash",
          contents: contents,
        });
      } else {
        // No conversation history - use simple prompt
        stream = await genAI.models.generateContentStream({
          model: "gemini-2.0-flash",
          contents: `You are a helpful study assistant. Student question: ${sanitizedContent}
            
            Provide a helpful, educational response in plain text without any markdown formatting. Do not use asterisks, underscores, or other markdown syntax.`,
        });
      }

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          const sanitized = sanitizeMarkdown(text);
          res.write(`data: ${JSON.stringify({ type: "chunk", content: sanitized })}\n\n`);
        }
      }

      // Save the complete AI response
      const assistantMessage = await storage.createChatMessage({
        userId,
        materialId: materialId || null,
        role: "assistant",
        content: sanitizeMarkdown(fullResponse),
      });

      // Send completion event with full message
      res.write(`data: ${JSON.stringify({ type: "complete", message: assistantMessage })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Error processing chat message:", error);
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message || "Failed to process chat message" })}\n\n`);
      res.end();
    }
  });

  // Study Session routes
  app.get("/api/study-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessions = await storage.getStudySessionsByUser(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching study sessions:", error);
      res.status(500).json({ message: "Failed to fetch study sessions" });
    }
  });

  app.post("/api/study-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessionData = insertStudySessionSchema.parse({ ...req.body, userId });
      const session = await storage.createStudySession(sessionData);
      res.json(session);
    } catch (error: any) {
      console.error("Error creating study session:", error);
      res.status(400).json({ message: error.message || "Failed to create study session" });
    }
  });

  app.patch("/api/study-sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getStudySession(req.params.id);
      if (!session || session.userId !== req.user.id) {
        return res.status(404).json({ message: "Study session not found" });
      }

      const updates = req.body;
      const updatedSession = await storage.updateStudySession(req.params.id, updates);

      // Update user stats if session ended
      if (updates.endTime && updates.duration) {
        const user = await storage.getUser(req.user.id);
        if (user) {
          const totalStudyTime = user.totalStudyTime + updates.duration;
          
          // Update streak logic
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
          lastStudy?.setHours(0, 0, 0, 0);
          
          let currentStreak = user.currentStreak;
          if (updates.duration >= 30 && updates.tabSwitches === 0) { // Min 30 min focused study
            if (!lastStudy || lastStudy.getTime() === today.getTime()) {
              // Same day, no change
            } else if (lastStudy && (today.getTime() - lastStudy.getTime() === 86400000)) {
              // Consecutive day
              currentStreak++;
            } else {
              // Streak broken
              currentStreak = 1;
            }
          }

          await storage.updateUserStats(req.user.id, {
            totalStudyTime,
            currentStreak,
            longestStreak: Math.max(currentStreak, user.longestStreak),
            lastStudyDate: today,
          });
        }
      }

      res.json(updatedSession);
    } catch (error: any) {
      console.error("Error updating study session:", error);
      res.status(400).json({ message: error.message || "Failed to update study session" });
    }
  });

  // Todo routes
  app.get("/api/todos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const todos = await storage.getTodosByUser(userId);
      res.json(todos);
    } catch (error) {
      console.error("Error fetching todos:", error);
      res.status(500).json({ message: "Failed to fetch todos" });
    }
  });

  app.post("/api/todos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const todoData = insertTodoSchema.parse({ ...req.body, userId });
      const todo = await storage.createTodo(todoData);
      res.json(todo);
    } catch (error: any) {
      console.error("Error creating todo:", error);
      res.status(400).json({ message: error.message || "Failed to create todo" });
    }
  });

  app.patch("/api/todos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const todo = await storage.getTodo(req.params.id);
      if (!todo || todo.userId !== req.user.id) {
        return res.status(404).json({ message: "Todo not found" });
      }
      const updatedTodo = await storage.updateTodo(req.params.id, req.body);
      res.json(updatedTodo);
    } catch (error: any) {
      console.error("Error updating todo:", error);
      res.status(400).json({ message: error.message || "Failed to update todo" });
    }
  });

  app.delete("/api/todos/:id", isAuthenticated, async (req: any, res) => {
    try {
      const todo = await storage.getTodo(req.params.id);
      if (!todo || todo.userId !== req.user.id) {
        return res.status(404).json({ message: "Todo not found" });
      }
      await storage.deleteTodo(req.params.id);
      res.json({ message: "Todo deleted successfully" });
    } catch (error) {
      console.error("Error deleting todo:", error);
      res.status(500).json({ message: "Failed to delete todo" });
    }
  });

  // Pomodoro routes
  app.get("/api/pomodoro-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessions = await storage.getPomodoroSessionsByUser(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching pomodoro sessions:", error);
      res.status(500).json({ message: "Failed to fetch pomodoro sessions" });
    }
  });

  app.post("/api/pomodoro-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessionData = insertPomodoroSessionSchema.parse({ ...req.body, userId });
      const session = await storage.createPomodoroSession(sessionData);
      res.json(session);
    } catch (error: any) {
      console.error("Error creating pomodoro session:", error);
      res.status(400).json({ message: error.message || "Failed to create pomodoro session" });
    }
  });

  // Leaderboard routes
  app.get("/api/leaderboard/study-time", isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const topUsers = await storage.getTopUsersByStudyTime(limit);
      
      // Transform data to match frontend expectations
      const leaderboard = topUsers.map(user => ({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        totalTime: user.totalStudyTime, // in minutes
      }));
      
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching study time leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch study time leaderboard" });
    }
  });

  app.get("/api/leaderboard/quiz-score", isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const topUsers = await storage.getTopUsersByQuizScore(limit);
      
      // Transform data to match frontend expectations
      const leaderboard = topUsers.map(user => ({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        averageScore: user.quizzesCompleted > 0 
          ? (user.totalQuizScore / user.quizzesCompleted) 
          : 0,
        quizCount: user.quizzesCompleted,
      }));
      
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching quiz score leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch quiz score leaderboard" });
    }
  });

  // Collaboration Session routes
  app.post("/api/collab/sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Ensure user exists in database before creating session
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      } else {
        // Update user info from Clerk if changed
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      }
      
      const sessionCode = Math.random().toString(36).substring(2, 12).toUpperCase();
      const sessionData = insertCollabSessionSchema.parse({
        ...req.body,
        hostUserId: userId,
        sessionCode,
      });
      const session = await storage.createCollabSession(sessionData);
      
      // Create whiteboard for session
      await storage.createCollabWhiteboard({
        sessionId: session.id,
        content: { elements: [] },
      });
      
      // Add host as participant
      await storage.createCollabParticipant({
        sessionId: session.id,
        userId,
        role: "host",
      });
      
      res.json(session);
    } catch (error: any) {
      console.error("Error creating collab session:", error);
      res.status(400).json({ message: error.message || "Failed to create collab session" });
    }
  });

  app.get("/api/collab/sessions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getCollabSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching collab session:", error);
      res.status(500).json({ message: "Failed to fetch collab session" });
    }
  });

  app.get("/api/collab/sessions/code/:code", isAuthenticated, async (req: any, res) => {
    try {
      const session = await storage.getCollabSessionByCode(req.params.code);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error fetching collab session by code:", error);
      res.status(500).json({ message: "Failed to fetch collab session" });
    }
  });

  app.get("/api/collab/my-sessions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessions = await storage.getCollabSessionsByHost(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching user's collab sessions:", error);
      res.status(500).json({ message: "Failed to fetch collab sessions" });
    }
  });

  app.post("/api/collab/sessions/:id/end", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const session = await storage.getCollabSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      if (session.hostUserId !== userId) {
        return res.status(403).json({ message: "Only the host can end the session" });
      }
      
      const endedSession = await storage.endCollabSession(req.params.id);
      
      // Notify all connected clients that the session has ended
      notifySessionEnded(req.params.id);
      
      res.json(endedSession);
    } catch (error) {
      console.error("Error ending collab session:", error);
      res.status(500).json({ message: "Failed to end collab session" });
    }
  });

  // Collaboration Participant routes
  app.post("/api/collab/sessions/:id/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const sessionId = req.params.id;
      
      // Ensure user exists in database before joining
      let user = await storage.getUser(userId);
      if (!user) {
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      } else {
        // Update user info from Clerk if changed
        user = await storage.upsertUser({
          id: userId,
          email: req.user.email,
          firstName: req.user.firstName || undefined,
          lastName: req.user.lastName || undefined,
          profileImageUrl: req.user.profileImageUrl || undefined,
        });
      }
      
      const session = await storage.getCollabSession(sessionId);
      if (!session || !session.isActive) {
        return res.status(404).json({ message: "Session not found or inactive" });
      }
      
      // Check if already a participant
      const existing = await storage.getCollabParticipantByUserAndSession(userId, sessionId);
      if (existing) {
        return res.json(existing);
      }
      
      const participantData = insertCollabParticipantSchema.parse({
        sessionId,
        userId,
        role: "member",
      });
      
      const participant = await storage.createCollabParticipant(participantData);
      res.json(participant);
    } catch (error: any) {
      console.error("Error joining collab session:", error);
      res.status(400).json({ message: error.message || "Failed to join collab session" });
    }
  });

  app.get("/api/collab/sessions/:id/participants", isAuthenticated, async (req: any, res) => {
    try {
      const participants = await storage.getActiveCollabParticipantsBySession(req.params.id);
      
      // Fetch user details for each participant
      const participantsWithUsers = await Promise.all(
        participants.map(async (p) => {
          const user = await storage.getUser(p.userId);
          return { ...p, user };
        })
      );
      
      res.json(participantsWithUsers);
    } catch (error) {
      console.error("Error fetching participants:", error);
      res.status(500).json({ message: "Failed to fetch participants" });
    }
  });

  // Collaboration Whiteboard routes
  app.get("/api/collab/sessions/:id/whiteboard", isAuthenticated, async (req: any, res) => {
    try {
      const whiteboard = await storage.getCollabWhiteboardBySession(req.params.id);
      if (!whiteboard) {
        return res.status(404).json({ message: "Whiteboard not found" });
      }
      res.json(whiteboard);
    } catch (error) {
      console.error("Error fetching whiteboard:", error);
      res.status(500).json({ message: "Failed to fetch whiteboard" });
    }
  });

  app.patch("/api/collab/whiteboards/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updates = { content: req.body.content };
      const whiteboard = await storage.updateCollabWhiteboard(req.params.id, updates);
      res.json(whiteboard);
    } catch (error) {
      console.error("Error updating whiteboard:", error);
      res.status(500).json({ message: "Failed to update whiteboard" });
    }
  });

  // Collaboration Activity routes
  app.get("/api/collab/sessions/:id/activities", isAuthenticated, async (req: any, res) => {
    try {
      const activities = await storage.getCollabActivitiesBySession(req.params.id);
      res.json(activities);
    } catch (error) {
      console.error("Error fetching activities:", error);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket for collaboration
  setupCollabWebSocket(httpServer);
  
  return httpServer;
}
