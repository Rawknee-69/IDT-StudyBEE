import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignInButton } from "@clerk/clerk-react";
import { BookOpen, Brain, Target, Trophy, Timer, Zap, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("animate-in");
        }
      });
    }, observerOptions);

    const elements = document.querySelectorAll(".fade-in-up");
    elements.forEach((el) => observer.observe(el));

    return () => {
      elements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        
        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        .fade-in-up {
          opacity: 0;
          transition: opacity 0.6s ease-out, transform 0.6s ease-out;
        }
        
        .fade-in-up.animate-in {
          animation: fadeInUp 0.8s ease-out forwards;
        }
        
        .float-animation {
          animation: float 6s ease-in-out infinite;
        }
        
        .gradient-animation {
          background-size: 200% 200%;
          animation: gradient 8s ease infinite;
        }
        
        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .card-hover:hover {
          transform: translateY(-8px);
        }
        
        .icon-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>

      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 fade-in-up">
            <div className="relative">
              <BookOpen className="h-8 w-8 text-primary" data-testid="logo-icon" />
              <Sparkles className="h-3 w-3 text-primary absolute -top-1 -right-1 icon-pulse" />
            </div>
            <span className="text-2xl font-heading font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent" data-testid="logo-text">
              Study Bee
            </span>
          </div>
          <div className="flex items-center gap-3 fade-in-up">
            <ThemeToggle />
            <SignInButton mode="modal">
              <Button 
                data-testid="button-login"
                className="relative overflow-hidden group"
              >
                <span className="relative z-10">Sign In</span>
                <span className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Button>
            </SignInButton>
          </div>
        </div>
      </header>

      <section 
        ref={heroRef}
        className="relative py-32 md:py-40 overflow-hidden"
      >
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="fade-in-up">
              <h1 
                className="font-heading font-bold text-5xl md:text-7xl lg:text-8xl mb-6 bg-gradient-to-r from-primary via-secondary to-gamification bg-clip-text text-transparent leading-tight" 
                data-testid="text-hero-title"
              >
                Study Bee
              </h1>
            </div>
            
            <div className="fade-in-up" style={{ animationDelay: "0.2s" }}>
              <p 
                className="text-lg md:text-xl lg:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed" 
                data-testid="text-hero-subtitle"
              >
                Transform your PDFs into flashcards, quizzes, mind maps, and summaries with cutting-edge AI. Track your progress, compete on leaderboards, and master your studies.
              </p>
            </div>
            
            <div 
              className="flex flex-wrap gap-4 justify-center fade-in-up" 
              style={{ animationDelay: "0.4s" }}
            >
              <SignInButton mode="modal">
                <Button 
                  size="lg" 
                  className="text-lg px-8 py-6 relative overflow-hidden group shadow-lg hover:shadow-xl transition-all duration-300" 
                  data-testid="button-get-started"
                >
                  <span className="relative z-10">Get Started Free</span>
                  <span className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Button>
              </SignInButton>
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6 border-2 hover:bg-accent/50 transition-all duration-300" 
                asChild 
                data-testid="button-learn-more"
              >
                <a href="#features">Learn More</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section 
        id="features" 
        ref={featuresRef}
        className="py-28 md:py-36 relative"
      >
        <div className="container mx-auto px-4">
          <div className="fade-in-up text-center mb-16">
            <h2 
              className="font-heading font-bold text-3xl md:text-5xl mb-4 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent" 
              data-testid="text-features-title"
            >
              Powerful AI Study Tools
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-primary to-secondary mx-auto rounded-full" />
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            <Card 
              className="p-8 card-hover border-2 hover:border-primary/50 bg-card/50 backdrop-blur-sm fade-in-up" 
              data-testid="card-feature-ai-chat"
              style={{ animationDelay: "0.1s" }}
            >
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mb-4 float-animation">
                  <Brain className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h3 className="font-heading font-semibold text-xl mb-3">AI Study Chat</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ask questions about your study materials and get instant, intelligent answers from our AI assistant.
              </p>
            </Card>

            <Card 
              className="p-8 card-hover border-2 hover:border-secondary/50 bg-card/50 backdrop-blur-sm fade-in-up" 
              data-testid="card-feature-flashcards"
              style={{ animationDelay: "0.2s" }}
            >
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-secondary/10 flex items-center justify-center mb-4 float-animation" style={{ animationDelay: "0.5s" }}>
                  <Zap className="h-8 w-8 text-secondary" />
                </div>
              </div>
              <h3 className="font-heading font-semibold text-xl mb-3">Auto Flashcards</h3>
              <p className="text-muted-foreground leading-relaxed">
                Generate flashcards automatically from your PDFs using AI. Review and master key concepts effortlessly.
              </p>
            </Card>

            <Card 
              className="p-8 card-hover border-2 hover:border-success/50 bg-card/50 backdrop-blur-sm fade-in-up" 
              data-testid="card-feature-quizzes"
              style={{ animationDelay: "0.3s" }}
            >
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-success/10 flex items-center justify-center mb-4 float-animation" style={{ animationDelay: "1s" }}>
                  <Target className="h-8 w-8 text-success" />
                </div>
              </div>
              <h3 className="font-heading font-semibold text-xl mb-3">Smart Quizzes</h3>
              <p className="text-muted-foreground leading-relaxed">
                AI-generated quizzes with anti-cheat tab detection. Test your knowledge and track your scores.
              </p>
            </Card>

            <Card 
              className="p-8 card-hover border-2 hover:border-warning/50 bg-card/50 backdrop-blur-sm fade-in-up" 
              data-testid="card-feature-mind-maps"
              style={{ animationDelay: "0.4s" }}
            >
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-warning/10 flex items-center justify-center mb-4 float-animation" style={{ animationDelay: "1.5s" }}>
                  <BookOpen className="h-8 w-8 text-warning" />
                </div>
              </div>
              <h3 className="font-heading font-semibold text-xl mb-3">Mind Maps</h3>
              <p className="text-muted-foreground leading-relaxed">
                Visualize complex topics with AI-generated mind maps. See connections and understand concepts better.
              </p>
            </Card>

            <Card 
              className="p-8 card-hover border-2 hover:border-gamification/50 bg-card/50 backdrop-blur-sm fade-in-up" 
              data-testid="card-feature-leaderboards"
              style={{ animationDelay: "0.5s" }}
            >
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-gamification/10 flex items-center justify-center mb-4 float-animation" style={{ animationDelay: "2s" }}>
                  <Trophy className="h-8 w-8 text-gamification" />
                </div>
              </div>
              <h3 className="font-heading font-semibold text-xl mb-3">Global Leaderboards</h3>
              <p className="text-muted-foreground leading-relaxed">
                Compete with students worldwide. Earn points for study time, quiz scores, and maintain daily streaks.
              </p>
            </Card>

            <Card 
              className="p-8 card-hover border-2 hover:border-destructive/50 bg-card/50 backdrop-blur-sm fade-in-up" 
              data-testid="card-feature-productivity"
              style={{ animationDelay: "0.6s" }}
            >
              <div className="mb-6">
                <div className="w-16 h-16 rounded-xl bg-destructive/10 flex items-center justify-center mb-4 float-animation" style={{ animationDelay: "2.5s" }}>
                  <Timer className="h-8 w-8 text-destructive" />
                </div>
              </div>
              <h3 className="font-heading font-semibold text-xl mb-3">Productivity Tools</h3>
              <p className="text-muted-foreground leading-relaxed">
                Pomodoro timer, todo lists, and concentration mode with focus tracking to maximize your study sessions.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-28 md:py-36 relative overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center fade-in-up">
            <h2 
              className="font-heading font-bold text-3xl md:text-5xl mb-6 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent" 
              data-testid="text-cta-title"
            >
              Ready to Transform Your Study Experience?
            </h2>
            <p 
              className="text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed" 
              data-testid="text-cta-subtitle"
            >
              Join thousands of students who are already mastering their subjects with AI-powered learning tools.
            </p>
            <SignInButton mode="modal">
              <Button 
                size="lg" 
                className="text-lg px-10 py-6 relative overflow-hidden group shadow-lg hover:shadow-xl transition-all duration-300" 
                data-testid="button-cta-start"
              >
                <span className="relative z-10">Start Learning Today</span>
                <span className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Button>
            </SignInButton>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="fade-in-up">
              <h4 className="font-heading font-semibold mb-4 text-foreground">Product</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-primary transition-colors duration-200 inline-block">
                    Pricing
                  </a>
                </li>
                <li>
                  <SignInButton mode="modal">
                    <a 
                      href="#" 
                      className="hover:text-primary transition-colors duration-200 inline-block" 
                      onClick={(e) => e.preventDefault()}
                    >
                      Dashboard
                    </a>
                  </SignInButton>
                </li>
              </ul>
            </div>
            <div className="fade-in-up" style={{ animationDelay: "0.1s" }}>
              <h4 className="font-heading font-semibold mb-4 text-foreground">Resources</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Study Guides
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Blog
                  </a>
                </li>
              </ul>
            </div>
            <div className="fade-in-up" style={{ animationDelay: "0.2s" }}>
              <h4 className="font-heading font-semibold mb-4 text-foreground">Company</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div className="fade-in-up" style={{ animationDelay: "0.3s" }}>
              <h4 className="font-heading font-semibold mb-4 text-foreground">Legal</h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#features" className="hover:text-primary transition-colors duration-200 inline-block">
                    Terms of Service
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t text-center text-muted-foreground fade-in-up">
            <p data-testid="text-copyright">© 2026 Study Bee. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
