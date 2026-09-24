import type { Metadata } from "next";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  CircleCheck,
  Globe2,
  Inbox,
  Layers3,
  LockKeyhole,
  MessageSquare,
  MousePointer2,
  Plus,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  Zap,
} from "lucide-react";
import LandingMotion from "@/components/landing-motion";
import "@fontsource-variable/manrope";
import "./landing.css";

export const metadata: Metadata = {
  title: "DraftPilot — Less typing. More human.",
  description:
    "Thoughtful customer support replies, right inside your inbox. DraftPilot brings your knowledge base and your team's voice to every draft. You review, insert, and send.",
};

const platforms = [
  "Gmail",
  "Outlook",
  "Zendesk",
  "Crisp",
  "Mevrik",
  "Your browser",
];
const faq = [
  [
    "Will DraftPilot send messages for me?",
    "No. DraftPilot prepares a reply, and you choose when to insert it into your chat or email editor. You can edit it before sending. Your inbox’s send button stays in your hands.",
  ],
  [
    "Which support platforms can I use?",
    "The extension includes dedicated capture for Gmail, Outlook, and Zendesk, plus configurable capture for Crisp, Mevrik, and other browser-based inboxes. On unfamiliar pages, select a customer message or choose a capture element. Compatibility depends on the page’s accessible message and editor fields.",
  ],
  [
    "Where does the information in a draft come from?",
    "DraftPilot searches the knowledge uploaded to your workspace and applies your configured tone. Review the draft and its sources before sending: AI can still make mistakes, especially when a policy is missing or out of date.",
  ],
  [
    "Do I need to bring an AI API key?",
    "No. The platform administrator configures the AI provider and model. Customer accounts and the extension do not receive the provider’s API key.",
  ],
  [
    "Can I try it before choosing a paid plan?",
    "The Free plan includes 50 drafts per month for one seat. You can also explore the sample workspace before signing up. You can manage your plan from workspace billing.",
  ],
];

function Brand() {
  return (
    <a className="lp-brand" href="/" aria-label="DraftPilot home">
      <span className="lp-brand-icon">
        <Zap size={22} fill="currentColor" />
      </span>
      DraftPilot<span className="lp-brand-dot">.</span>
    </a>
  );
}
function Action({
  children = "Start for free",
  href = "/signup",
  secondary = false,
}: {
  children?: React.ReactNode;
  href?: string;
  secondary?: boolean;
}) {
  return (
    <a
      className={`lp-button${secondary ? " lp-button-secondary" : ""}`}
      href={href}
    >
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
  );
}
function ReplyCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`lp-reply-card${compact ? " lp-reply-compact" : ""}`}>
      <div className="lp-reply-heading">
        <span>
          <Zap size={16} fill="currentColor" /> DraftPilot
        </span>
        <span className="lp-ready">
          <i /> Draft ready
        </span>
      </div>
      <div className="lp-reply-meta">
        <span>
          <BookOpen size={12} /> Returns policy
        </span>
        <span>Warm & helpful</span>
      </div>
      <p>
        Hi Jamie! Absolutely — you have 30 days to return an unworn item. I can
        help you get a return started and find the right size.
      </p>
      <div className="lp-reply-bottom">
        <span>
          <CheckCheck size={14} /> Ready for your review
        </span>
        <span className="lp-insert-label">
          Insert at chat box <ArrowRight size={14} />
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      <LandingMotion />
      <a className="lp-skip" href="#main">
        Skip to content
      </a>
      <div className="lp-progress" aria-hidden="true" />
      <header className="lp-header">
        <div className="lp-nav">
          <Brand />
          <nav className="lp-desktop-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#integrations">Integrations</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="lp-nav-actions">
            <a className="lp-login" href="/login">
              Log in <ArrowUpRight size={14} />
            </a>
            <Action />
          </div>
          <details className="lp-mobile-nav">
            <summary aria-label="Menu navigation">
              <span>Menu</span>
              <Plus size={18} />
            </summary>
            <nav aria-label="Mobile navigation">
              <a href="#how-it-works">How it works</a>
              <a href="#integrations">Integrations</a>
              <a href="#pricing">Pricing</a>
              <a href="/login">Log in</a>
              <a href="/signup">Start for free</a>
            </nav>
          </details>
        </div>
      </header>
      <main id="main">
        <section className="lp-hero lp-container">
          <div className="lp-hero-copy" data-reveal>
            <span className="lp-eyebrow">
              <span className="lp-status-dot" /> YOUR INBOX. WITH A LITTLE
              SUPERPOWER.
            </span>
            <h1>
              Less typing.
              <br />
              <span>More human.</span>
            </h1>
            <p className="lp-lead">
              Give every customer a thoughtful reply.
              <br className="lp-desktop-break" /> DraftPilot brings your
              knowledge and your voice
              <br className="lp-desktop-break" /> into the inbox you already
              use.
            </p>
            <div className="lp-hero-actions">
              <Action />
              <a className="lp-text-link" href="#how-it-works">
                Meet your copilot <ArrowDown size={16} />
              </a>
            </div>
            <div className="lp-small-proof">
              <Check size={14} /> 50 free drafts a month
              <span />
              <Check size={14} /> You always hit send
            </div>
          </div>
          <div
            className="lp-hero-visual"
            aria-label="Illustrated example of a customer question and a DraftPilot reply"
          >
            <div className="lp-orbit lp-orbit-one" />
            <div className="lp-orbit lp-orbit-two" />
            <div className="lp-inbox-card">
              <div className="lp-inbox-toolbar">
                <span>
                  <Inbox size={16} /> Support inbox
                </span>
                <span className="lp-demo-tag">PRODUCT EXAMPLE</span>
              </div>
              <div className="lp-customer">
                <span className="lp-avatar">JL</span>
                <div>
                  <strong>Jamie Lee</strong>
                  <span>Question about my order</span>
                </div>
                <span className="lp-time">Just now</span>
              </div>
              <p>
                Hey! The sneakers I ordered are a little too small. Can I return
                them for a different size?
              </p>
              <div className="lp-inbox-context">
                <span>
                  <Layers3 size={13} /> Conversation captured
                </span>
                <CircleCheck size={15} />
              </div>
            </div>
            <div className="lp-connection" aria-hidden="true">
              <span />
              <Sparkles size={18} />
              <span />
            </div>
            <ReplyCard />
            <div className="lp-float-note">
              <MousePointer2 size={15} /> A draft, never an auto-send.
            </div>
          </div>
          <div className="lp-hero-foot">
            <span>LESS TAB HOPPING. MORE PROBLEM SOLVING.</span>
            <span>
              Scroll to see the flow <ArrowDown size={13} />
            </span>
          </div>
        </section>
        <section
          id="integrations"
          className="lp-platforms lp-container"
          aria-labelledby="platform-title"
        >
          <p id="platform-title">At home in the tools you already use.</p>
          <div className="lp-platform-list">
            {platforms.map((p, i) => (
              <span key={p}>
                {i === 0 ? <Inbox /> : i === 5 ? <Globe2 /> : <MessageSquare />}{" "}
                {p}
              </span>
            ))}
          </div>
          <p className="lp-platform-note">
            Dedicated inbox adapters + flexible capture for other browser-based
            tools.
          </p>
        </section>
        <section id="how-it-works" className="lp-story lp-container">
          <div className="lp-section-intro" data-reveal>
            <span className="lp-eyebrow">
              FROM QUESTION TO “THAT WAS EASY.”
            </span>
            <h2>
              A better reply.
              <br />
              Without the detour.
            </h2>
            <p>
              No copying conversations into another app.
              <br />
              Just a little help, right where you work.
            </p>
          </div>
          <div className="lp-story-layout">
            <div className="lp-story-steps">
              <article className="lp-story-step" data-reveal>
                <span className="lp-step-number">01 / CAPTURE</span>
                <h3>Stay in the conversation.</h3>
                <p>
                  Open a customer’s message. DraftPilot picks up the context in
                  supported inboxes. On other pages, select a message or set a
                  capture area — no copy and paste.
                </p>
                <span className="lp-step-detail">
                  <Inbox size={16} /> Your inbox is still your workspace.
                </span>
              </article>
              <article className="lp-story-step" data-reveal>
                <span className="lp-step-number">02 / UNDERSTAND</span>
                <h3>
                  Your knowledge.
                  <br />
                  Your kind of helpful.
                </h3>
                <p>
                  Ground the response in your workspace’s knowledge base. Add
                  your team’s tone, so a helpful answer sounds like it came from
                  you.
                </p>
                <span className="lp-step-detail">
                  <BookOpen size={16} /> Policies, product details, and your
                  voice.
                </span>
              </article>
              <article className="lp-story-step" data-reveal>
                <span className="lp-step-number">03 / REVIEW & INSERT</span>
                <h3>
                  A head start.
                  <br />
                  You have the final word.
                </h3>
                <p>
                  Read the draft, check the source, and choose “Insert at chat
                  box.” Fine-tune it in your reply editor. Send when you’re
                  ready.
                </p>
                <span className="lp-step-detail">
                  <MousePointer2 size={16} /> One click to insert. Always yours
                  to send.
                </span>
              </article>
            </div>
            <div className="lp-story-sticky">
              <div className="lp-story-display" aria-hidden="true">
                <div className="lp-display-top">
                  <span className="lp-window-dots">● ● ●</span>
                  <span>THE DRAFTPILOT FLOW</span>
                  <LockKeyhole size={13} />
                </div>
                <div className="lp-flow-tabs">
                  <span>Capture</span>
                  <span>Understand</span>
                  <span>Reply</span>
                </div>
                <div className="lp-flow-query">
                  <span className="lp-avatar">JL</span>
                  <p>Can I return these for a different size?</p>
                  <Check size={16} />
                </div>
                <div className="lp-flow-knowledge">
                  <span className="lp-knowledge-icon">
                    <BookOpen size={24} />
                  </span>
                  <div>
                    <strong>Returns & exchanges</strong>
                    <p>Unworn items · Within 30 days</p>
                  </div>
                  <span className="lp-source-label">SOURCE</span>
                </div>
                <div className="lp-flow-tone">
                  <WandSparkles size={15} /> A little warmer. A lot more you.
                  <span>Warm & helpful</span>
                </div>
                <div className="lp-flow-reply">
                  <ReplyCard compact />
                </div>
                <div className="lp-flow-editor">
                  <span>Reply to Jamie</span>
                  <p>
                    Hi Jamie! Absolutely — you have 30 days to return an unworn
                    item…
                  </p>
                  <span className="lp-send-label">
                    Your editor. Your send button. <ArrowUpRight size={15} />
                  </span>
                </div>
              </div>
              <span className="lp-story-caption">
                An illustrative preview of capture, grounding, and insertion.
              </span>
            </div>
          </div>
        </section>
        <section className="lp-values lp-container" id="control">
          <div className="lp-values-heading" data-reveal>
            <span className="lp-eyebrow">HELPFUL BY DESIGN.</span>
            <h2>
              More care.
              <br />
              Less busywork.
            </h2>
            <p>
              Built for the people on the other
              <br />
              side of the support conversation.
            </p>
          </div>
          <div className="lp-value-grid">
            <article data-reveal>
              <BookOpen size={26} />
              <h3>Answers with a foundation.</h3>
              <p>
                Your uploaded knowledge gives drafts context. Review the sources
                so you can reply with confidence.
              </p>
            </article>
            <article data-reveal>
              <WandSparkles size={26} />
              <h3>Sound like your team.</h3>
              <p>
                Choose a tone that fits your brand. Keep your replies consistent
                without making them feel canned.
              </p>
            </article>
            <article data-reveal>
              <ShieldCheck size={26} />
              <h3>Human, by default.</h3>
              <p>
                Nothing sends itself. Review, edit, and insert each draft. You
                decide what reaches your customer.
              </p>
            </article>
            <article data-reveal>
              <LockKeyhole size={26} />
              <h3>Control behind the scenes.</h3>
              <p>
                Workspace access controls, drafting quotas, and server-side AI
                credentials keep the essentials managed.
              </p>
            </article>
          </div>
        </section>
        <section id="pricing" className="lp-pricing lp-container">
          <div className="lp-pricing-intro" data-reveal>
            <span className="lp-eyebrow">A LITTLE HELP GOES A LONG WAY.</span>
            <h2>
              Start small.
              <br />
              Make room for more.
            </h2>
            <p>
              Try the flow. Find your voice.
              <br />
              Bring your whole team when you’re ready.
            </p>
            <a className="lp-text-link" href="/app">
              Explore the sample workspace <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="lp-plans">
            <article className="lp-plan" data-reveal>
              <span className="lp-plan-name">
                Free <span>GET A FEEL FOR IT</span>
              </span>
              <div className="lp-price">
                $0<span>/ month</span>
              </div>
              <p>A little everyday drafting help.</p>
              <ul>
                <li>
                  <Check />
                  50 drafts per month
                </li>
                <li>
                  <Check />1 team member
                </li>
                <li>
                  <Check />
                  Knowledge-based replies
                </li>
                <li>
                  <Check />
                  Browser extension
                </li>
              </ul>
              <Action secondary>Start free</Action>
            </article>
            <article className="lp-plan lp-plan-team" data-reveal>
              <span className="lp-plan-name">
                Team <span>ROOM TO GROW</span>
              </span>
              <div className="lp-price">
                $19<span>/ seat / month</span>
              </div>
              <p>A shared voice for your support team.</p>
              <ul>
                <li>
                  <Check />
                  1,000 drafts per seat / month
                </li>
                <li>
                  <Check />
                  Shared workspace knowledge
                </li>
                <li>
                  <Check />
                  Team roles and access
                </li>
                <li>
                  <Check />
                  Usage and billing controls
                </li>
              </ul>
              <Action>Get started</Action>
            </article>
            <p className="lp-price-note">
              Prices in USD. Start with a free account; manage upgrades in your
              workspace.
            </p>
          </div>
        </section>
        <section className="lp-faq lp-container">
          <div data-reveal>
            <span className="lp-eyebrow">A FEW THINGS YOU MIGHT WONDER.</span>
            <h2>
              Good questions.
              <br />
              Straight answers.
            </h2>
          </div>
          <div className="lp-faq-list">
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Plus size={18} aria-hidden="true" />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="lp-last-call lp-container" data-reveal>
          <div className="lp-last-symbol">
            <Zap size={32} fill="currentColor" />
          </div>
          <span className="lp-eyebrow">YOUR NEXT GREAT REPLY STARTS HERE.</span>
          <h2>
            A little less typing.
            <br />
            <span>A lot more connection.</span>
          </h2>
          <Action>Find your flow</Action>
          <p>50 free drafts a month. Every send stays yours.</p>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div>
          <Brand />
          <p>A thoughtful reply, every time.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#how-it-works">Product</a>
          <a href="#pricing">Pricing</a>
          <a href="#control">Your control</a>
          <a href="/login">
            Log in <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} DraftPilot</span>
          <span>
            Made for the human side of support. <Sparkles size={13} />
          </span>
        </div>
      </footer>
    </div>
  );
}
