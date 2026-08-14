import React, { useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
  Cpu, 
  Code2, 
  Activity, 
  Search, 
  FlaskConical, 
  Zap, 
  ChevronDown, 
  Mail, 
  Smartphone,
  Check,
  TerminalSquare
} from 'lucide-react';

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7 } }
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const features = [
  {
    icon: <TerminalSquare className="w-6 h-6 text-primary" />,
    title: "Instant Block Diagrams",
    description: "Describe your chip in plain English. We instantly parse your intent and generate a precise architectural block diagram."
  },
  {
    icon: <Code2 className="w-6 h-6 text-primary" />,
    title: "One-Tap HDL Generation",
    description: "Convert your architecture into clean, Verilog-style HDL code with a single tap. Ready for review, simulation, or handoff."
  },
  {
    icon: <Activity className="w-6 h-6 text-primary" />,
    title: "AI Design Critique",
    description: "Run an automated analysis to catch structural bottlenecks, missing pipeline stages, and common timing hazards before synthesis."
  },
  {
    icon: <Search className="w-6 h-6 text-primary" />,
    title: "Automated Code Review",
    description: "Get line-by-line AI feedback on your generated HDL, explaining design decisions and highlighting areas for optimization."
  },
  {
    icon: <FlaskConical className="w-6 h-6 text-primary" />,
    title: "Testbench Generation",
    description: "Verify your logic instantly. We automatically generate a comprehensive testbench to validate your core functionality."
  },
  {
    icon: <Zap className="w-6 h-6 text-primary" />,
    title: "Synthesis & Estimation",
    description: "Run a pre-synthesis pass to get immediate resource estimates, including LUT count, flip-flops, and estimated clock speed."
  }
];

const faqs = [
  {
    question: "What is Chip Forge AI?",
    answer: "Chip Forge AI is an iOS app that lets you design digital circuits using natural language. You describe what you want to build, and the app generates block diagrams, HDL code, and resource estimates."
  },
  {
    question: "Is this foundry-ready output?",
    answer: "No. Chip Forge AI is a pre-tapeout design handoff tool. It's built for rapid prototyping, learning, and architectural exploration. Getting to silicon requires additional physical design steps, but we handle everything up to that point."
  },
  {
    question: "What is HDL?",
    answer: "Hardware Description Language (HDL) is a specialized computer language used to describe the structure and behavior of electronic circuits, most commonly digital logic circuits. Our app generates Verilog-style HDL."
  },
  {
    question: "What devices does the app support?",
    answer: "Chip Forge AI is currently available exclusively for iOS devices (iPhone and iPad) on the App Store."
  },
  {
    question: "How do I export my design?",
    answer: "You can export your generated HDL, testbenches, and block diagrams directly from the app as plain text files or PDFs, ready to be imported into your desktop EDA tools."
  },
  {
    question: "What does the AI synthesis estimate give me?",
    answer: "The estimate provides a baseline expectation of hardware utilization (Look-Up Tables and Flip-Flops) and potential maximum clock speed, giving you immediate feedback on the feasibility of your design."
  }
];

function FAQItem({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-border/50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
      >
        <span className="text-lg font-medium text-foreground">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-muted-foreground leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground overflow-hidden selection:bg-primary/30 selection:text-primary">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono font-bold text-lg tracking-tight">
            <Cpu className="w-5 h-5 text-primary" />
            <span>Chip Forge<span className="text-primary">.ai</span></span>
          </div>
          <a 
            href="#support" 
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Support
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6">
        <div className="absolute inset-0 pointer-events-none circuit-pattern opacity-[0.03] mask-image-b" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-3xl"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-mono mb-6">
              <Smartphone className="w-4 h-4" />
              <span>Available for iOS</span>
            </motion.div>
            
            <motion.h1 variants={fadeUp} className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              Design chips with AI.
            </motion.h1>
            
            <motion.p variants={fadeUp} className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-10 max-w-2xl font-mono border-l-2 border-primary pl-4">
              Describe your idea and get HDL code, fast.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Philosophy / Disclaimer Banner */}
      <section className="border-y border-white/5 bg-secondary/30 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-center gap-8 justify-between">
            <div className="max-w-2xl">
              <h3 className="text-lg font-mono font-bold text-foreground mb-2 flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Pre-Tapeout Handoff
              </h3>
              <p className="text-muted-foreground">
                Chip Forge AI is built for students, enthusiasts, and rapid architectural exploration. It is an honest, pre-tapeout handoff tool. We handle the design, critique, and logic verification up to silicon — but getting to a foundry-ready submission requires additional steps.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Everything you need to conceptualize.</h2>
            <p className="text-muted-foreground font-mono">From idea to verified HDL in your pocket.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="group p-8 rounded-2xl bg-card border border-card-border hover:border-primary/50 transition-colors relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="mb-6 inline-flex items-center justify-center w-12 h-12 rounded-xl bg-secondary border border-white/5">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-6 bg-secondary/20 border-t border-white/5">
        <div className="max-w-3xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground font-mono">Technical details and capabilities.</p>
          </div>
          
          <div className="flex flex-col">
            {faqs.map((faq, idx) => (
              <FAQItem key={idx} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* Support / Contact */}
      <section id="support" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none circuit-pattern opacity-[0.02]" />
        
        <div className="max-w-3xl mx-auto relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Need technical support?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Encountered a synthesis error? Have feature requests? Our engineering team is ready to help.
          </p>
          
          <a 
            href="mailto:[your support email]"
            className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground font-mono font-bold rounded-sm hover:bg-primary/90 transition-colors"
          >
            <Mail className="w-5 h-5" />
            Contact Support
          </a>
          <p className="mt-4 text-sm text-muted-foreground font-mono">
            Email: [your support email]
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 font-mono font-bold text-muted-foreground">
            <Cpu className="w-4 h-4" />
            <span>Chip Forge AI</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Chip Forge AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}