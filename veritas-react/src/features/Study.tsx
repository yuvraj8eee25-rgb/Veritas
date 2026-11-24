import ChoiceField from "@/components/ChoiceField";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import PaperStudy from "./PaperStudy";
import ReasoningDiagram from "../components/ReasoningDiagram";
import WorkedExample from "../components/WorkedExample";
import { studyLessons, studyPaths, studySources, pathForLesson } from "../../../app/src/features/study-content.js";

import type { LessonRecord, StudyStore } from "../lib/study-storage";
import { blankStore, days, readStudyStore } from "../lib/study-storage";
type Lesson = any;
type StudyProps = { ownerUid: string; onTransfer: (screen: string, detail: string) => void; onPrepareAssignment: (draft: Record<string, unknown>) => void; onAwardXp: (amount: number) => void };

function getWeekKey(date = new Date()) { const monday = new Date(date); monday.setHours(0,0,0,0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`; }


export default function Study({ ownerUid, onTransfer, onPrepareAssignment, onAwardXp }: StudyProps) {
  const initialLesson = useRef(new URLSearchParams(window.location.search).get("lesson"));
  const openedFor = useRef<string | null>(null);
  const [section, setSection] = useState("learn");
  const [linkStatus, setLinkStatus] = useState("");
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [store, setStore] = useState<StudyStore>(blankStore);
  const [assignmentLessonId, setAssignmentLessonId] = useState(studyLessons[0]?.id ?? "");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [stage, setStage] = useState<"recall" | "learn" | "practice" | "reflect" | "finish">("recall");
  const [answer, setAnswer] = useState<number | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState("");
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [answeredCorrect, setAnsweredCorrect] = useState<number[]>([]);
  const [reflection, setReflection] = useState("");
  const [rubricChecks, setRubricChecks] = useState<number[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const lesson = useMemo(() => studyLessons.find((item: Lesson) => item.id === lessonId) as Lesson | undefined, [lessonId]);

  useEffect(() => {
    try { setStore(readStudyStore(localStorage, ownerUid)); } catch { setStore(blankStore()); }
    setLoadedFor(ownerUid);
  }, [ownerUid]);

  useEffect(() => {
    if (loadedFor !== ownerUid) return;
    try { localStorage.setItem(`veritas_study_v1:${ownerUid}`, JSON.stringify(store)); } catch { /* available for this visit */ }
  }, [store, loadedFor, ownerUid]);

  useEffect(() => {
    if (loadedFor !== ownerUid || openedFor.current === ownerUid) return;
    openedFor.current = ownerUid;
    if (initialLesson.current && studyLessons.some((item: Lesson) => item.id === initialLesson.current)) start(initialLesson.current);
  }, [loadedFor, ownerUid]);

  const weekKey = getWeekKey();
  const sessionsThisWeek = store.sessions.filter(session => session.week === weekKey).length;
  const reviewQueue = studyLessons.filter((item: Lesson) => {
    const due = store.lessons[item.id]?.reviewAt;
    return due && new Date(due) <= new Date();
  });
  const nextLesson = reviewQueue[0] || studyLessons.find((item: Lesson) => !store.lessons[item.id]?.completions) || studyLessons[0];
  const reminderDue = store.reminder && days[new Date().getDay()] === store.reminderDay && !store.reminderSeenWeeks.includes(weekKey);
  const activity: any = lesson?.activities?.[practiceIndex];

  function updateStore(patch: Partial<StudyStore>) { setStore(current => ({ ...current, ...patch })); }
  function start(id: string) {
    const selected = studyLessons.find((item: Lesson) => item.id === id) as Lesson | undefined;
    if (!selected) return;
    const url = new URL(window.location.href); url.searchParams.set("lesson", id);
    window.history.replaceState(window.history.state, "", url);
    setLessonId(id); setStage("recall"); setAnswer(null); setAnswerCorrect(null); setFeedback(""); setPracticeIndex(0); setCorrectCount(0); setAttemptCount(0); setAnsweredCorrect([]); setReflection(""); setRubricChecks([]);
    const first = selected.activities?.[0];
    setOrder(first?.type === "order" ? first.items.map((item: any) => item.id).reverse() : []);
  }
  function closeLesson() {
    setLessonId(null); setLinkStatus("");
    const url = new URL(window.location.href); url.searchParams.delete("lesson");
    window.history.replaceState(window.history.state, "", url);
  }
  function saveNote(note: any) {
    if (store.bookmarks.some(item => item.title === note.title)) return;
    updateStore({ bookmarks: [{ ...note, lesson: lesson?.title, savedAt: new Date().toISOString() }, ...store.bookmarks].slice(0,100) });
    setFeedback(`Saved ${note.title} to Field Notes.`);
  }
  function nextPractice() {
    const next = practiceIndex + 1;
    if (next >= lesson.activities.length) { setStage("reflect"); setFeedback(""); return; }
    setPracticeIndex(next); setAnswer(null); setAnswerCorrect(null); setFeedback(""); setRubricChecks([]);
    const item = lesson.activities[next];
    setOrder(item.type === "order" ? item.items.map((entry: any) => entry.id).reverse() : []);
  }
  function recordAnswer(isCorrect: boolean, message: string, incrementAttempt = true) {
    if (incrementAttempt) setAttemptCount(value => value + 1); setAnswerCorrect(isCorrect); setFeedback(message);
    if (isCorrect && !answeredCorrect.includes(practiceIndex)) {
      setAnsweredCorrect(value => [...value, practiceIndex]);
      setCorrectCount(value => value + 1);
    }
  }
  function completeLesson() {
    const now = new Date();
    const prior = store.lessons[lesson.id] || { completions: 0, correct: 0, attempts: 0, reviewAt: null };
    const successfulReview = correctCount >= lesson.activities.length;
    const intervalDays = successfulReview ? Math.min(30, Math.max(5, (prior.intervalDays || 2.5) * 2)) : 2;
    const record: LessonRecord = { ...prior, completions: prior.completions + 1, correct: correctCount, attempts: prior.attempts + Math.max(1,attemptCount), lastCompletedAt: now.toISOString(), intervalDays, reviewAt: new Date(now.getTime() + intervalDays * 86400000).toISOString() };
    const sessions = [...store.sessions, { lessonId: lesson.id, at: now.toISOString(), week: getWeekKey(now) }].slice(-120);
    updateStore({ lessons: { ...store.lessons, [lesson.id]: record }, sessions });
    if (!prior.completions) onAwardXp(10);
    setStage("finish");
  }
  function prepareAssignment() {
    const path = pathForLesson(lesson.id);
    onPrepareAssignment({ title: `Study: ${lesson.title}`, instructions: `Complete the Veritas Study lesson “${lesson.title}” in the “${path.title}” path.\n\nFocus: ${lesson.objective}\n\nLesson: /workspace/study?lesson=${lesson.id} (path: ${path.id}). Return to Classroom and submit a short note describing one idea you learned and where you could use it.`, kind: "position_paper", status: "draft", studyPathId: path.id, studyLessonId: lesson.id });
  }

  if (loadedFor !== ownerUid) return <section className="study-react-page"><p role="status">Loading your study plan…</p></section>;
  if (lesson) {
    const path = pathForLesson(lesson.id);
    const stages = [{id:"recall",label:"Recall"},{id:"learn",label:"Learn"},{id:"practice",label:"Practice"},{id:"reflect",label:"Reflect"},{id:"finish",label:"Finish"}];
    const stageIndex = stages.findIndex(item => item.id === stage);
    return <section className="study-react-page">
      <div className="study-lesson-toolbar"><button className="back-link" onClick={closeLesson}>Study plan</button><button className="workspace-text-action" onClick={async () => {
        const url = new URL("/workspace/study", window.location.origin); url.searchParams.set("lesson", lesson.id);
        try { await navigator.clipboard.writeText(url.href); setLinkStatus("Lesson link copied. Progress stays private to each learner."); }
        catch { setLinkStatus(`Lesson link: ${url.href}`); }
      }}>Copy lesson link</button></div>{linkStatus && <p role="status">{linkStatus}</p>}
      <div className="study-react-heading"><span className="eyebrow">{lesson.duration} MIN · {lesson.skills.join(" · ")}</span><h1>{lesson.title}</h1><p>{lesson.objective}</p></div>
      <aside className="study-lesson-progress" aria-label="Your lesson progress"><ol className="study-react-stages" aria-label="Lesson stages">{stages.map((item,index)=><li className={index < stageIndex ? "done" : index === stageIndex ? "current" : ""} aria-current={item.id===stage?"step":undefined} key={item.id}><span aria-hidden="true">{index < stageIndex ? "✓" : index+1}</span><span>{item.label}</span></li>)}</ol><p className="study-stage-status">Step {stageIndex+1} of {stages.length} · {stages[stageIndex].label}</p></aside>
      {stage === "recall" && <Card className="study-react-card"><span className="eyebrow">QUICK RECALL · NO PRESSURE</span><h2>{lesson.recall.prompt}</h2><div className="study-react-choices">{lesson.recall.choices.map((choice: any,index: number)=><button key={choice.id||index} className={answer===index?"selected":""} onClick={()=>{setAnswer(index);setAttemptCount(value=>value+1);setFeedback(choice.feedback);}}>{choice.label}</button>)}</div>{feedback&&<p className="study-react-feedback" role="status">{feedback}</p>}{feedback&&<Button className="study-react-primary" onClick={()=>{setStage("learn");setAnswer(null);setFeedback("");}}>Continue <span aria-hidden="true">→</span></Button>}</Card>}
      {stage === "learn" && <Card className="study-react-card"><span className="eyebrow">THE IDEA</span><h2>{lesson.title}</h2><p className="study-react-objective">{lesson.objective}</p><div className="study-react-explanation">{lesson.explanation}</div><ReasoningDiagram compact variant={path.id} /><WorkedExample example={lesson.example} />{lesson.sources?.length>0&&<details className="study-react-sources"><summary>Sources and limitations</summary>{lesson.sources.map((key: string)=>{const source=(studySources as any)[key];return source&&<p key={key}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><br/>{source.note}</p>;})}</details>}{(lesson.saveables||[]).map((item:any,index:number)=><Button variant="outline" size="sm" className="study-react-save" key={index} onClick={()=>saveNote(item)}>Save {item.type}</Button>)}<Button className="study-react-primary" onClick={()=>{setStage("practice");setFeedback("");}}>Try it yourself <span aria-hidden="true">→</span></Button></Card>}
      {stage === "practice" && activity?.type === "choice" && <Card className="study-react-card"><span className="eyebrow">PRACTICE {practiceIndex+1} OF {lesson.activities.length}</span><h2>{activity.prompt}</h2>{activity.context&&<p className="study-react-context">{activity.context}</p>}{activity.hint&&<p className="study-react-hint">{activity.hint}</p>}<div className="study-react-choices">{activity.choices.map((choice:any,index:number)=><button key={choice.id||index} className={answer===index?(answerCorrect?"selected":"wrong"):""} disabled={answer!==null&&answerCorrect===true} onClick={()=>{setAnswer(index);recordAnswer(Boolean(choice.correct),choice.feedback);}}>{choice.label}</button>)}</div>{feedback&&<p className="study-react-feedback" role="status">{feedback}</p>}{answerCorrect===true&&<Button className="study-react-primary" onClick={nextPractice}>{practiceIndex+1>=lesson.activities.length?"Reflect and finish":"Next question"} <span aria-hidden="true">→</span></Button>}{answerCorrect===false&&<Button variant="outline" onClick={()=>{setAnswer(null);setAnswerCorrect(null);setFeedback("");}}>Try again</Button>}</Card>}
      {stage === "practice" && activity?.type === "order" && <Card className="study-react-card"><span className="eyebrow">PRACTICE {practiceIndex+1} OF {lesson.activities.length} · ORDER THE CHECKS</span><h2>{activity.prompt}</h2>{activity.context&&<p className="study-react-context">{activity.context}</p>}<ol className="study-order-list">{order.map((id,index)=>{const item=activity.items.find((entry:any)=>entry.id===id);return <li key={id}><span>{item?.text}</span><div><button disabled={index===0||answerCorrect===true} onClick={()=>setOrder(current=>{const next=[...current];[next[index-1],next[index]]=[next[index],next[index-1]];return next;})} aria-label="Move earlier">↑</button><button disabled={index===order.length-1||answerCorrect===true} onClick={()=>setOrder(current=>{const next=[...current];[next[index+1],next[index]]=[next[index],next[index+1]];return next;})} aria-label="Move later">↓</button></div></li>;})}</ol><Button className="study-react-primary" disabled={answerCorrect===true} onClick={()=>{const good=activity.correctOrder.every((id:string,index:number)=>order[index]===id);recordAnswer(good,good?activity.feedback:"That order needs another look. Check the publisher and original evidence before judging the claim.");}}>Check order</Button>{feedback&&<p className="study-react-feedback" role="status">{feedback}</p>}{answerCorrect===true&&<Button onClick={nextPractice}>{practiceIndex+1>=lesson.activities.length?"Reflect and finish":"Next question"} →</Button>}{answerCorrect===false&&<Button variant="outline" onClick={()=>{setAnswerCorrect(null);setFeedback("");}}>Try again</Button>}</Card>}
      {stage === "practice" && activity?.type === "reflect" && <Card className="study-react-card"><span className="eyebrow">PRACTICE {practiceIndex+1} OF {lesson.activities.length} · WRITE</span><h2>{activity.prompt}</h2><Textarea className="study-react-answer" value={reflection} onChange={event=>setReflection(event.target.value)} placeholder={activity.placeholder||"Write a short reflection…"}/><div className="study-reflection-rubric">{(activity.rubric||[]).map((item:string,index:number)=><label key={index}><input type="checkbox" checked={rubricChecks.includes(index)} onChange={event=>setRubricChecks(current=>event.target.checked?[...current,index]:current.filter(value=>value!==index))}/>{item}</label>)}</div><p className="study-react-hint">Review your response with the checklist. It is not automatically graded.</p><Button className="study-react-primary" onClick={()=>{setAttemptCount(value=>value+1);if(reflection.trim().length<(activity.minimum||10)){setFeedback(`Add at least ${activity.minimum||10} characters, then review the checklist.`);return;}if(rubricChecks.length<(activity.rubric||[]).length){setFeedback("Read and check each part of the response checklist before continuing.");return;}recordAnswer(true,"You reviewed your response against the checklist.",false);}}>Review my response</Button>{feedback&&<p className="study-react-feedback" role="status">{feedback}</p>}{answerCorrect&&<Button onClick={nextPractice}>{practiceIndex+1>=lesson.activities.length?"Reflect and finish":"Next question"} →</Button>}</Card>}
      {stage === "reflect" && <Card className="study-react-card"><span className="eyebrow">MAKE IT YOURS</span><h2>Explain it in your own words</h2><p>{lesson.activities.find((item:any)=>item.type==="reflect")?.prompt||"Where could you use this skill?"}</p><Textarea className="study-react-answer" value={reflection} onChange={event=>setReflection(event.target.value)} placeholder="One place I can use this is…"/><p className="study-react-hint">This private reflection is not graded.</p><Button className="study-react-primary" onClick={completeLesson}>Finish lesson →</Button></Card>}
      {stage === "finish" && <article className="study-react-card study-react-finish"><span className="study-react-check">✓</span><span className="eyebrow">LESSON COMPLETE</span><h2>{correctCount>=lesson.activities.length?"You’re building a strong habit.":"You put the idea to work."}</h2><p>{correctCount} of {lesson.activities.length} practice checks answered correctly. {correctCount<lesson.activities.length?"A little more practice will help this skill settle in.":"Your next review follows your recent practice history."}</p><p className="study-review-date">Next review {store.lessons[lesson.id]?.reviewAt?new Date(store.lessons[lesson.id].reviewAt!).toLocaleDateString():"in two days"}</p><Button className="study-react-primary" onClick={closeLesson}>Back to your study plan →</Button><Button variant="outline" onClick={()=>onTransfer(lesson.transfer.screen,lesson.transfer.detail)}>{lesson.transfer.label}</Button><Button variant="outline" onClick={prepareAssignment}>Prepare a Classroom draft</Button><button className="study-react-text-button" onClick={()=>start(lesson.id)}>Practice this lesson again</button></article>}
      <small className="study-react-path-label">{path.title}</small>
    </section>;
  }

  return <section className="study-react-page">
    <div className="study-react-heading"><h1>Study paths</h1><p>Short, focused lessons for clearer arguments and better evidence checks.</p></div>
    <nav className="studio-tabs" aria-label="Study tools">{[{id:"learn",label:"Learn & review"},{id:"papers",label:"Paper Study"},{id:"notes",label:`Field Notes (${store.bookmarks.length})`},{id:"preferences",label:"Preferences & tools"}].map(item=><button type="button" key={item.id} aria-pressed={section===item.id} onClick={()=>setSection(item.id)}>{item.label}</button>)}</nav>
    <div hidden={section!=="learn"}>
    <section className="study-react-next"><div><span className="eyebrow">{reviewQueue.includes(nextLesson)?"READY FOR A QUICK REVIEW":"YOUR NEXT STEP"}</span><h2>{nextLesson.title}</h2><p>{nextLesson.objective}</p></div><Button className="study-react-primary" onClick={()=>start(nextLesson.id)}>{reviewQueue.includes(nextLesson)?"Review lesson":"Start lesson"}</Button></section>
    <p className="study-learning-meta">{sessionsThisWeek} of {store.target} study sessions this week <span>·</span> {studyLessons.length} short lessons to explore</p>
    {reminderDue&&<div className="study-react-reminder" role="status"><span>Your planned {store.reminderDay} study day is here. A short lesson is ready.</span><button onClick={()=>updateStore({reminderSeenWeeks:[...store.reminderSeenWeeks,weekKey].slice(-16)})}>Dismiss</button></div>}
    <section className="study-react-review"><div className="study-react-section-title"><div><span className="eyebrow">SPACED PRACTICE</span><h2>Review queue</h2></div><small>{reviewQueue.length} due</small></div>{reviewQueue.length?reviewQueue.map((item:Lesson)=><article key={item.id}><span><strong>{item.title}</strong><small>{pathForLesson(item.id).title}</small></span><Button variant="outline" onClick={()=>start(item.id)}>Review</Button></article>):<p>You’re all caught up. New reviews appear here as you complete lessons.</p>}</section>
    <div className="study-react-section-title"><div><span className="eyebrow">PICK UP A SKILL</span><h2>Learning paths</h2></div><small>{studyLessons.length} short lessons</small></div>
    <div className="study-react-paths">{studyPaths.map((path:any)=><article className={`study-react-path ${path.color}`} key={path.id}><div className="study-react-path-top"><span>{path.icon}</span><small>{path.lessons.filter((id:string)=>store.lessons[id]?.completions).length}/{path.lessons.length} lessons</small></div><span className="eyebrow">{path.eyebrow}</span><h3>{path.title}</h3><p>{path.description}</p><details className="study-path-lessons" open={path.id===pathForLesson(nextLesson.id).id}><summary>Explore lessons</summary><div className="study-react-lesson-list">{path.lessons.map((id:string)=>{const item=studyLessons.find((entry:Lesson)=>entry.id===id);const record=store.lessons[id];return item&&<button key={id} onClick={()=>start(id)}><span>{item.title}</span><small>{record?.completions?`Completed ${record.completions}x`:`${item.duration} min`} →</small></button>;})}</div></details></article>)}</div>
    </div>
    <div hidden={section!=="papers"}>
    <PaperStudy key={ownerUid} ownerUid={ownerUid} />
    </div>
    <div hidden={section!=="notes"}>
    <section className="study-react-notes"><div><span className="eyebrow">YOUR FIELD NOTES</span><h2>Saved material <small>{store.bookmarks.length}</small></h2></div>{store.bookmarks.length?store.bookmarks.map((note,index)=><article key={`${note.title}-${index}`}><div><small>{note.type} · {note.lesson}</small><strong>{note.title}</strong><p>{note.excerpt}</p></div><button onClick={()=>updateStore({bookmarks:store.bookmarks.filter((_,i)=>i!==index)})} aria-label={`Remove ${note.title}`}>×</button></article>):<p>Save a useful checklist or frame from a lesson and it will appear here.</p>}</section>
    </div>
    <div hidden={section!=="preferences"}>
    <section className="study-weekly-goal"><div><span className="eyebrow">THIS WEEK</span><h2>{sessionsThisWeek} / {store.target} study sessions</h2><div className="progress-track"><i style={{width:`${Math.min(100,sessionsThisWeek/store.target*100)}%`}}/></div></div><ChoiceField label="Weekly goal" value={store.target} options={[2, 3, 5].map(value => ({ value, label: `${value} sessions` }))} onChange={target => updateStore({ target })} /></section>
    <section className="study-react-preferences"><div><span className="eyebrow">A GENTLE NUDGE</span><h2>Study reminder</h2><p>Show a reminder when you return on your chosen day. No email or push notifications.</p></div><label><input type="checkbox" checked={store.reminder} onChange={event=>updateStore({reminder:event.target.checked})}/> Remind me next visit</label><ChoiceField label="Preferred study day" value={store.reminderDay} disabled={!store.reminder} options={days.slice(1).concat(days[0]).map(day => ({ value: day, label: day }))} onChange={reminderDay => updateStore({ reminderDay })} /></section>
    <details className="study-teacher"><summary>For teachers · prepare a Classroom activity</summary><div><p>Choose a lesson to prefill a draft. Review and edit it in Classroom before saving.</p><ChoiceField label="Study lesson" value={assignmentLessonId} options={studyLessons.map((item: Lesson) => ({ value: item.id, label: `${pathForLesson(item.id).title} · ${item.title}` }))} onChange={setAssignmentLessonId} /><Button variant="outline" onClick={()=>{const item=studyLessons.find((entry:Lesson)=>entry.id===assignmentLessonId);if(!item)return;onPrepareAssignment({title:`Study: ${item.title}`,instructions:`Complete the Veritas Study lesson “${item.title}” in the “${pathForLesson(item.id).title}” path.\n\nFocus: ${item.objective}\n\nLesson: /workspace/study?lesson=${item.id}. Return to Classroom and submit a short note describing one idea you learned and where you could use it.`,kind:"position_paper",status:"draft",studyPathId:pathForLesson(item.id).id,studyLessonId:item.id});}}>Prepare Classroom draft →</Button></div></details>
    <details className="study-react-sources"><summary>How these lessons are informed</summary><p>Lessons use retrieval practice, worked examples, specific feedback and transfer prompts. Evidence supports these teaching approaches on average, but outcomes vary by setting.</p>{Object.values(studySources).map((source:any)=><p key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><br/>{source.note}</p>)}</details>
    </div>
  </section>;
}
