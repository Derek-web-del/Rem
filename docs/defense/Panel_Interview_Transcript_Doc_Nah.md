# Transcript of Interview / Panel Defense

**Primary discussants:** SAMSON, Johann Nathan; Doc Nah (panelist); Derek John E. Bantad; Abricam Tinga; Leonardo, Ely May; De Gracia, Maria Isabel

**Duration:** ~32 minutes 36 seconds

---

## Summary

This session was a time-boxed panel review of the team’s school/LMS system, led mainly by **Doc Nah**, with demos from **Derek John E. Bantad** and inputs from **SAMSON, Johann Nathan**, **Abricam Tinga**, and others.

Doc Nah opened by asking for previous comments on screen, then pressed the team on curriculum workflow, role-based access, and whether system requirements match DepEd grading/enrollment processes. The team explained that the client was not fully comfortable sharing their full curriculum and instead provided a DepEd curriculum guide. Demo covered role-based login (school admin, faculty, student), Gmail OTP verification, terms and conditions, and a curriculum view of major subjects (Filipino, English, Math, TLE, MAPEH).

Major panel concerns included:

1. **Curriculum editing** — Curriculum appears as an uploaded/viewable file (e.g., PDF), not editable content inside the system; Doc Nah expected in-system create/edit and asked whether this was documented as a scope/limitation.
2. **Role separation** — School admin and system admin appear conflated; school admin accounts are created/handled at the backend (DigitalOcean) rather than through a clear product turnover model; Doc Nah flagged this as uncommon industry practice.
3. **Missing controls** — No conflicting-schedule validation for faculty assignment; UX issues such as selecting all weekdays in one click; syllabus creation ownership unclear relative to curriculum.
4. **Faculty/subject assignment** — Admin creates subjects, assigns teachers by grade/semester, with schedule and room; credentials/OTP go to faculty email.
5. **Faculty/student features** — Classwork (syllabus, topics, lessons, assignments, activities), student assignment submit (PDF), quiz maker (title, type, deadline, duration, attempts, points, optional passcode). Passcode is shared outside the system (online/announce), not generated in-app. Anti-cheat behavior (fullscreen / F11) was mentioned but hard to visualize in the remaining time.

Doc Nah closed the panel portion (~31:30), wished the team luck with the next panelists, and Abricam Tinga asked for the recording plus a summary of comments. Ely May clarified that comments from the first defense/redefense should be combined into the current documentation.

---

## Transcript of Interview

| Timestamp | Name | Saying / Explanation |
|-----------|------|----------------------|
| 0:04 | SAMSON, Johann Nathan | Yes, Bob. |
| 0:05 | Doc Nah | All right, perfect. Could you flash on screen my comments, my previous comments? Can we start with that? |
| 0:19 | Doc Nah | Because I don't have anything here. |
| 0:24 | Doc Nah | Mhm. |
| 0:25 | Derek John E. Bantad | Wait. |
| 0:26 | Doc Nah | Sure, sure, sure. Maybe guide picture on your document up, or somebody join on mobile and show it from mobile. So I think that will be the quickest if you don't have it. |
| 0:40 | SAMSON, Johann Nathan | Where did you put mommy? |
| 0:40 | Abricam Tinga | Doc, not oriented like it by young. Secondly, like things are L grading systems on the laying that at 90 nila finale yung curriculum or process nang DE for the enrollment and grading. |
| 0:42 | Doc Nah | Yeah. |
| 1:00 | Abricam Tinga | Et cetera. |
| 1:02 | Doc Nah | All right. OK. OK. Thank you. Thank you. So, question I have: I didn't write anything on the grading sheet. |
| 1:02 | Abricam Tinga | Just for the recollection, love. |
| 1:08 | Abricam Tinga | Uh-uh. |
| 1:17 | Doc Nah | Tamaba or what? |
| 1:18 | Abricam Tinga | Yes, the… |
| 1:21 | Doc Nah | Ohh. |
| 1:22 | Doc Nah | All right, OK, so guess again, copy on that. OK, so therefore, did you already know YU process from of your own client? |
| 1:41 | SAMSON, Johann Nathan | And so far, they weren't totally comfortable sharing the curriculum, but what they provided is a guide for mismo nang DepEd. That was… |
| 1:45 | Doc Nah | Yeah. |
| 1:51 | Doc Nah | Thanks. |
| 2:01 | Doc Nah | All right. |
| 2:02 | SAMSON, Johann Nathan | So, in the curriculum… |
| 2:11 | Doc Nah | All right, okay, alright, so that also assigned some student. |
| 2:22 | Doc Nah | Nung nung Sab Jay. |
| 2:25 | SAMSON, Johann Nathan | Upper baseboard. |
| 2:25 | Doc Nah | But is now faculty based on the curriculum? |
| 2:32 | Doc Nah | All right, okay. But on the, on the, what do you call this one? But on the defense itself, we stop on the curriculum. |
| 2:44 | SAMSON, Johann Nathan | Yes, Pablo. |
| 2:45 | Doc Nah | Module. All right. Okay. So what do you plan to show today? |
| 2:52 | SAMSON, Johann Nathan | Aye. |
| 2:55 | Doc Nah | Okay, starting off with the creation of curriculum. |
| 3:01 | SAMSON, Johann Nathan | Fistball. |
| 3:01 | Doc Nah | How about role access? I remember I do also have a concern with regards to view, because everything is being seen by everyone. |
| 3:16 | SAMSON, Johann Nathan | A sample part, ma'am. |
| 3:18 | Doc Nah | Now, about like in the faculty curriculum, subjects aligned in the sections. |
| 3:35 | Doc Nah | A VAN. |
| 3:37 | Doc Nah | Young group nan. |
| 3:39 | SAMSON, Johann Nathan | Yes, but… |
| 3:39 | Doc Nah | They were all right, so yeah, so I was saying like, so did you also work on those concerns? |
| 3:49 | Doc Nah | Yeah. |
| 3:50 | Doc Nah | Yeah. |
| 3:52 | Doc Nah | Or in De. |
| 3:56 | Doc Nah | Can I see? |
| 3:59 | Derek John E. Bantad | Hello, Puma. |
| 4:00 | Doc Nah | Hello, I am so sad because you… |
| 4:10 | Abricam Tinga | Talk. |
| 4:10 | Doc Nah | We should do that again. So curriculum is admin designed, but without the basis, they do not know. Doesn't know the workflow that in system requirements. |
| 4:29 | Doc Nah | To a great amount, the process of creating the curriculum template is age generated, getting subjects with schedule, assigning of subjects, creating faculty, assigning faculty, and Monday—system admin, faculty, students, and school admin. I am on a great role access there. |
| 4:50 | Doc Nah | Offline support, and that's also has been my question that hasn't—that wasn't answered, but I also want to know how did you resolve that now? OK, and then your incident response and accountability. |
| 5:08 | Doc Nah | You only have like 120 students. All right. Okay. So go ahead. Run me through starting up with a political. |
| 5:18 | Doc Nah | Make it faster, guys. |
| 5:21 | Doc Nah | I can only give you until 11:30. I'm very sorry. I'm very sorry. |
| 5:32 | Doc Nah | Everyone is muted. |
| 5:34 | Derek John E. Bantad | Hello, Puma. |
| 5:35 | Doc Nah | Hello, hello, yep, yep, okay, hello. |
| 5:37 | Derek John E. Bantad | As of now, the system is a role-based access control, which is the institute for the admin or the school administrator, then the faculty for the teachers and the students for the students only. And as we go back to the admin, just by typing the login ID… |
| 5:59 | Doc Nah | I sorry to interrupt, but have you presented this one, Abellana? The other panels? |
| 6:05 | Derek John E. Bantad | Um, no Pablo mum. |
| 6:06 | Doc Nah | I know, because Saturday was also cancelled, no? |
| 6:10 | Derek John E. Bantad | Yes, Puma. |
| 6:10 | SAMSON, Johann Nathan | ISABEL. |
| 6:11 | Doc Nah | Yeah, OK, alright, OK, go ahead, continue. |
| 6:13 | Derek John E. Bantad | And after receiving—after logging in, they will first try to… |
| 6:22 | Derek John E. Bantad | Put the input validation of the six-digit code via Gmail that was sent, or they will send through inbox or either spam e-mail. |
| 6:34 | Derek John E. Bantad | And you can see here, as the verification code is being sent from the spam e-mail, just by copying and pasting there, and verify continue, they will first see the first display is the terms and conditions. On why the first terms and conditions is to be able to use the system… |
| 6:44 | Doc Nah | Two. |
| 6:53 | Doc Nah | Hello. |
| 6:55 | Derek John E. Bantad | First, and to be able to read and accept, and you have to click the agreement to be able to use the system, and just by clicking the I agree, you will be able to see the dashboard first. |
| 6:58 | Doc Nah | One day. |
| 7:00 | Doc Nah | Ace. |
| 7:14 | Derek John E. Bantad | Liam Paul. |
| 7:16 | Doc Nah | Mmh. |
| 7:18 | Derek John E. Bantad | Then there has been many changes from our curriculum since the curriculum has been given to us. Just going to the curriculum, the curriculum has provided us a matter tag according to the DE. |
| 7:34 | Derek John E. Bantad | And just by viewing this, you will be able to see the curriculum all throughout the major subjects from the Filipino, English, Maths, TLE, and even MAPEH. |
| 7:51 | Doc Nah | Mm. |
| 7:54 | Doc Nah | Okay. |
| 7:57 | Doc Nah | So, can we try to edit it? Try to see, let's see, let's see. |
| 7:57 | Derek John E. Bantad | And also… Yes, Paul. |
| 8:03 | Doc Nah | Okay, so when you try to edit it, you just edit the stored file. |
| 8:08 | Derek John E. Bantad | Yes, Paul. |
| 8:09 | Doc Nah | Bhadakuri Kol Miza. |
| 8:10 | Derek John E. Bantad | Napnikulikulumpo. |
| 8:12 | Doc Nah | So, the curriculum itself are really created… not with your system. Not within your system, it's created outside the system. |
| 8:32 | SAMSON, Johann Nathan | Yes, Paul. |
| 8:33 | Doc Nah | OK, but then the girl… The girl at Bako. |
| 8:37 | SAMSON, Johann Nathan | Hindi pop, so… |
| 8:37 | Derek John E. Bantad | Hindi woman. |
| 8:40 | Doc Nah | Are you uncertain? |
| 8:44 | SAMSON, Johann Nathan | Nepal. |
| 8:44 | Derek John E. Bantad | No. |
| 8:45 | Doc Nah | In the… Okay, is it in the scope or limitation in your document? |
| 9:01 | SAMSON, Johann Nathan | And a boy in house. |
| 9:03 | Doc Nah | That one that they have mentioned. |
| 9:06 | SAMSON, Johann Nathan | Ah, wonderful. |
| 9:07 | Doc Nah | We are creating a curriculum here, so I'm expecting that it can also be edited. That's my expectation, no? As a siguro on the technical perspective. But on your end, if it's not, then is it written? |
| 9:26 | SAMSON, Johann Nathan | I need to… |
| 9:28 | Doc Nah | Oh, that's a thing. So who says it? |
| 9:43 | Doc Nah | Yeah. |
| 9:44 | SAMSON, Johann Nathan | And what do you mean, who says it? |
| 9:46 | Doc Nah | Who said that? Who's manipulating this? So, there's curriculum, it's there. We can now view it. No, it's in a PDF format. |
| 10:05 | Doc Nah | No, we can view it, and then when we edit it, it's in edit file, not in edit file itself, not in edit content file. |
| 10:21 | Derek John E. Bantad | I… |
| 10:23 | Doc Nah | Workflow, it's very unusual. |
| 10:36 | Doc Nah | Upload nothing new file and then edit is not in the edit nothing new file in which we upload another curriculum for dash 10 underscore DE. |
| 10:52 | SAMSON, Johann Nathan | Pablo. |
| 10:53 | Doc Nah | Ohh. |
| 10:55 | Doc Nah | The file is there, and the template doesn't really change that much, the content of the bag. |
| 11:06 | Doc Nah | Ann… at least on how I knew on the nine years, no, in admin and academic role, in an administrative and academic role. |
| 11:29 | Doc Nah | Who approves that design? |
| 11:36 | Doc Nah | Sinabi ba 'yan sa inyo nila naganondapad. |
| 11:41 | SAMSON, Johann Nathan | No time. |
| 11:45 | Doc Nah | Okay, and then? |
| 11:48 | SAMSON, Johann Nathan | Uh, so far, I want to comment on the client. |
| 11:59 | Doc Nah | OK, so, and then what else? So, this is the system admin. |
| 12:06 | Derek John E. Bantad | School admin. |
| 12:08 | Doc Nah | Okay, so the school admin. Okay. And then you have a system admin role now. Or voila. |
| 12:15 | Derek John E. Bantad | Um, Lalata. |
| 12:17 | Doc Nah | So, who creates the role of the school admin? |
| 12:43 | Derek John E. Bantad | Yes, Pablo. Yes, Paul. |
| 12:49 | Doc Nah | OK, so… |
| 12:56 | Derek John E. Bantad | From my understanding, Mum, is the system admin, school admin, teachers, and the students? |
| 13:09 | Doc Nah | That's OK, that's OK. No, but who creates the role of the school admin? |
| 13:17 | Derek John E. Bantad | Um… ma'am, since prepare push as for, as for like the school admin is also the system administrator. |
| 13:27 | Doc Nah | Did you create it at the back end? |
| 13:29 | Derek John E. Bantad | Um, yes, um, um, that's a Digital Ocean. |
| 13:35 | Doc Nah | Okay, I will like the system admin who take—who takes care of that in Digital Ocean. |
| 13:42 | Derek John E. Bantad | I'm the admin pool mom. |
| 13:44 | Doc Nah | Xinian. We… |
| 13:47 | Derek John E. Bantad | Which is the school admin from the… |
| 13:49 | Doc Nah | Etong etong naglalag etong nakalag in etong ayan. |
| 13:52 | Derek John E. Bantad | I guess, poor mom. |
| 13:56 | Doc Nah | So, the school admin is the system admin, per se. |
| 14:01 | SAMSON, Johann Nathan | ISABEL. |
| 14:02 | Derek John E. Bantad | Yes. |
| 14:02 | Doc Nah | Okay, I gonna get deploying guys. I gonna get turnover. And as people of tech, you should know that. |
| 14:14 | Doc Nah | Okay, so I don't know with the other panels if it's going to be acceptable since external panel, I might have a lower voice, no. But since I'm a panel coming from the industry also, we don't do it like that. And then… |
| 14:36 | Doc Nah | As you are also planning to go there, to the industry. OK, so you plan your deployment and turnover that way. |
| 14:50 | Doc Nah | Admin who grateful for this business side. And, and it's a tech person. |
| 14:59 | Doc Nah | OK, so yeah, they are relevant to the client, and we understand that they are small, there are only like 120 people in there, so right client and also… |
| 15:18 | Doc Nah | Never. |
| 15:20 | Doc Nah | That also gives a question that there might not be the right client, and there might also give you the answer, rather—not hindi sila. |
| 15:31 | Doc Nah | OK, but moving forward, that you have developed the system, that's why we're doing this activity now. OK, so right now, yeah, assigning our curriculum to a particular faculty. Let's do that. |
| 15:46 | Doc Nah | Science to a science teacher. |
| 15:50 | Doc Nah | My first follow by a new faculty or? |
| 15:57 | Derek John E. Bantad | Um, since through its curriculum is not displayed once advisory section for example like grades grade 10, make it up on the grade 10 admin. |
| 16:17 | Doc Nah | Okay, so by grade assignment, so… |
| 16:17 | Derek John E. Bantad | Ultra. Yes, Paul. I'm waiting. |
| 16:25 | Doc Nah | Jaan, jaan, jaan sa dashboard naan. |
| 16:33 | Doc Nah | Yeah, and talk with the module. |
| 16:39 | Doc Nah | But view it. |
| 16:43 | Doc Nah | I need e-mail sending you credentials. |
| 16:48 | Derek John E. Bantad | Credentials for using their e-mail that they will be able to receive the OTP code. |
| 16:55 | Doc Nah | To log into their account. |
| 16:57 | Derek John E. Bantad | I guess, poor mom. |
| 16:58 | Doc Nah | So it's like they're verified once we do that. |
| 17:01 | Derek John E. Bantad | Yes, Pablo. |
| 17:03 | Doc Nah | Okay, cool. Yung subjects under the faculties, can you see that? |
| 17:10 | Derek John E. Bantad | Mum, yung subjects po is dito po is naka-assign. Po, dito po is in school admin is make create po siya, then mag-a-assign po siya through its designated teacher. Kapag nag-add subject po siya then select on grade level in semester. Makikita na po yung subject. |
| 17:30 | Derek John E. Bantad | Code ID and subject name, grade level, subject semester, yung specific na faculty ID or teacher. Now within, i-publish na po through its subject code or yung room na po, then yung institute curriculum guide, then meron po dito na class schedule na makikita po siya. |
| 17:51 | Derek John E. Bantad | Same with the students that will be able to view the class schedule as well. |
| 17:58 | Doc Nah | How about your conflicting schedule? |
| 18:03 | Derek John E. Bantad | Po mom. |
| 18:04 | Doc Nah | On conflicting schedule, conflicting schedule from the faculty assignment. |
| 18:16 | Derek John E. Bantad | Um, as of now is wala pa. |
| 18:19 | Doc Nah | Is it part in your limitation? |
| 18:23 | Derek John E. Bantad | Um, Hindi po. |
| 18:25 | Doc Nah | Okay, so many things that are now missing here, no, and if it's not needed to be said—just better not to type and update the limitations. That's why we're asking so many things from you. Okay, so what's the subject code that we're going to assign to faculty? Let's run that. I want to see that. |
| 18:51 | Derek John E. Bantad | Just by adding the subject code, let's say science, then 01, then select. |
| 18:57 | Doc Nah | Kailangan alam, Nathan. |
| 19:00 | Derek John E. Bantad | Um, yes, poor mum, since yes, poor mum, since… |
| 19:01 | Doc Nah | In a type shower. |
| 19:09 | Derek John E. Bantad | Thumbs. |
| 19:14 | Doc Nah | Hello? |
| 19:17 | Doc Nah | Hello, new subject. |
| 19:21 | Derek John E. Bantad | Yes, for mum. |
| 19:21 | Doc Nah | Oh, see, okay, see, get, get. |
| 19:25 | Derek John E. Bantad | Then, click po the subject name, which is science, then faculty ID, select po, then let's say, for let's say grade 9 assigned to kanya, then class schedule. |
| 19:41 | Doc Nah | Balankore chulu mein gusoi mein matching curriculum. |
| 19:46 | Derek John E. Bantad | Are you in full? Institute curriculum guide available, which is in grade 10 science for then class schedule, which is weekdays available. |
| 19:54 | Doc Nah | Once again. Mhm. |
| 20:01 | Derek John E. Bantad | Then, let's say, for example, all throughout the weekdays available, room number which is room… |
| 20:12 | Doc Nah | But all throughout the week, they, but select well. |
| 20:18 | Derek John E. Bantad | In weekday school, mom. |
| 20:19 | Doc Nah | Available. If you are planning to get that kind of experience, you give the ability to the user to select everything in one ticker. |
| 20:37 | Derek John E. Bantad | Ohh. |
| 20:39 | Doc Nah | Kimberly. Guys experience. |
| 20:40 | Derek John E. Bantad | I just, since it's a—it's a focusing… |
| 20:49 | Doc Nah | So, room. |
| 20:49 | Derek John E. Bantad | Then… Then, room number, which is, let's say, for example, for 110. |
| 20:59 | Doc Nah | Let's go guys, 8 minutes. |
| 21:03 | Derek John E. Bantad | Then you upgraded na po siya, then punta po kami sa faculty po. |
| 21:12 | Derek John E. Bantad | Then, it's a type of name in YU. |
| 21:17 | Derek John E. Bantad | Your login ID, Victor Cruz. |
| 21:20 | Doc Nah | Panalalamani Victor Cruz ang login ID niya sa e-mail. |
| 21:25 | Derek John E. Bantad | Hindi, since they need distribute school admin accounts. |
| 21:30 | Doc Nah | Not in your system. |
| 21:32 | Derek John E. Bantad | From Hindi to… |
| 21:33 | Doc Nah | No, not in your system, yes. |
| 21:37 | Derek John E. Bantad | Yes, Puma. |
| 21:38 | Doc Nah | Or in your system. Okay, say it again. |
| 21:47 | Derek John E. Bantad | Oops. |
| 21:54 | Doc Nah | So, you know, you said your six-digit code is the admin. |
| 21:59 | Derek John E. Bantad | Through its custom domain, since my account e-mail sender automatically. |
| 22:10 | Doc Nah | Okay, okay, she admin it. |
| 22:19 | Derek John E. Bantad | They need to take Pune in… Then, first, first teacher is in terms and conditions for system. Then, dashboard advisory sections all throughout the sections. Then, subjects is… |
| 22:52 | Derek John E. Bantad | Is make it upon existing science then is an existing subject subject code po siya. Since bowel clone the Hindi po siya is… Is different subject code. |
| 23:16 | Doc Nah | Okay, can you click the details, please? |
| 23:20 | Derek John E. Bantad | Po, click po nang details Puma is makikita niya po yung modules, yung class, yung classwork, grades, and subject. |
| 23:34 | Derek John E. Bantad | Some more just for mom. Puma. |
| 23:37 | Doc Nah | Oh yeah, no, no, no, no, no, no, no, no, but open in the library, that's the biggest thing at the very beginning. |
| 23:51 | Doc Nah | Does it make sense? |
| 23:53 | Derek John E. Bantad | Yes, cool mom. |
| 23:54 | Doc Nah | Yeah. |
| 23:54 | SAMSON, Johann Nathan | Pablo. |
| 23:58 | Doc Nah | Mmh. |
| 23:59 | Derek John E. Bantad | Then next is next is public class work is add syllabus, add topic, add lesson, assignment, activity. |
| 23:59 | Doc Nah | Yeah. |
| 24:08 | Doc Nah | Can you open in your syllabus? |
| 24:11 | Derek John E. Bantad | Coming from the… |
| 24:12 | Doc Nah | We cannot add syllabus, but they need no experience. |
| 24:17 | Derek John E. Bantad | Some… Kapag mag-a-add po na syllabus po ma'am, is make it on Nepo yung specific na on Nepo syllabus na. |
| 24:21 | Doc Nah | Newly. |
| 24:27 | Derek John E. Bantad | Containing school admin, in SAS, syllables. |
| 24:34 | Doc Nah | Ohh, the requirement nagan yan pero hindi sa kasama doon sa school admin capabilities. |
| 24:43 | Derek John E. Bantad | Yes, boom. |
| 24:45 | Doc Nah | Iiba you see Labusam would be coming from the curriculum. |
| 24:52 | Derek John E. Bantad | From my understanding is the syllabus is contains the grades of the grading criteria in the… |
| 25:01 | Doc Nah | Yeah, oh, from the curriculum, subjects, the grades and criteria, the syllabus per week by week, divide and conquer the goal that came from the curriculum, high-level curriculum. |
| 25:22 | Doc Nah | So, the curriculum that is from the SCI 01 science, the syllabus, the granular… |
| 25:36 | Doc Nah | Mosse gayaplotka nasila busun science. |
| 25:42 | Doc Nah | That is my second comment. San is not playing in your workflow that are really good for them. |
| 25:53 | Doc Nah | How do you open it? |
| 25:56 | Derek John E. Bantad | Ann… PDF file. |
| 26:07 | Doc Nah | Yeah. |
| 26:09 | Doc Nah | So yeah, and then how about the student view for the last three minutes? |
| 26:19 | Derek John E. Bantad | Also, a student view is make it and for YU. |
| 26:36 | Doc Nah | How about you, Margaret, scan on submission? The activities. |
| 26:44 | Derek John E. Bantad | Ameron Puma. |
| 26:50 | Doc Nah | Okay, subjects. |
| 26:50 | Derek John E. Bantad | Ambat. |
| 26:55 | Doc Nah | Solakya Sabjakniya. |
| 26:57 | Derek John E. Bantad | Yes, Paul, make it on your display, unassigned topic. |
| 27:06 | Doc Nah | So, hindi ringa nagana na mga conflict na nakapalacha na mga subjects conflict. |
| 27:11 | Derek John E. Bantad | Hindi boom. |
| 27:14 | Doc Nah | OK, assignment. And you don't know what to do. |
| 27:17 | Derek John E. Bantad | Once… You make it a specific name, which is the subject code, then my status, then upload date and submission. View, subject assignment details. |
| 27:47 | Derek John E. Bantad | Then, in description, assignment preview, and download, then submit work using the PDF only format, and if ever grading criteria is according to the… |
| 28:06 | Derek John E. Bantad | Set up on the teacher, which is from the grades, which is according to the grading criteria of the setup of the teacher. |
| 28:19 | Doc Nah | Hello! |
| 28:21 | Derek John E. Bantad | Yes, Paul, Mum. |
| 28:22 | Doc Nah | OK, sorry, I kind of lost you for a second. All right, how about your quiz maker? |
| 28:28 | Derek John E. Bantad | The quiz maker is displaying the teacher. Let's say, for example, if you add quiz, we require a title, activity type, then deadline duration of how many minutes will the quiz. |
| 28:48 | Derek John E. Bantad | And, like 5 minutes, the maximum attempts, which is a minimum of one or more than two, then specific the subject is semester in total of points, then you passcode which is of optional student. |
| 28:56 | Doc Nah | Yeah. |
| 29:03 | Doc Nah | I think we have a sample that has been created on the side of the student. |
| 29:09 | Derek John E. Bantad | You? I'm still in Puma. |
| 29:14 | Doc Nah | Ar. |
| 29:19 | Derek John E. Bantad | Make it from the subjects side published by the teacher. |
| 29:36 | Derek John E. Bantad | So, action is details then view your results, but as of now, is… |
| 29:43 | Doc Nah | As I do, please. |
| 29:47 | Derek John E. Bantad | Yung Pagstart ko na quiz mum. |
| 29:50 | Doc Nah | Ohh. |
| 29:51 | Derek John E. Bantad | I'm at the pub. |
| 29:51 | Doc Nah | Right. |
| 29:53 | Derek John E. Bantad | My is my submission date, then my deadline, Pareja, since… |
| 29:57 | Doc Nah | Start the quiz. I want to see the quiz. I don't have much time. |
| 30:00 | Derek John E. Bantad | Oh. |
| 30:06 | Doc Nah | San Gavi San Agita y Pascode. |
| 30:09 | Derek John E. Bantad | The teacher will be giving it to the students via online or announcing it to the students as well. |
| 30:17 | Doc Nah | Only by online. |
| 30:24 | Derek John E. Bantad | By online, poor mum. |
| 30:25 | Doc Nah | Ar. |
| 30:30 | Leonardo, Ely May | During online meetings, a message teacher online. |
| 30:32 | Doc Nah | Ar. |
| 30:42 | Doc Nah | I thought it's also in the system. OK, thanks for that clarification. What happened? |
| 30:55 | Derek John E. Bantad | I'm sorry, Puma. |
| 30:59 | Doc Nah | Increase. |
| 31:01 | Derek John E. Bantad | Yes, Paul, since from the students view is make it full screen po siya, then once bypass the student F11 then switch. |
| 31:03 | Doc Nah | Right. Thanks. |
| 31:20 | Doc Nah | Yeah, again, I cannot visualize that. All right, thank you so much, everybody. |
| 31:30 | Doc Nah | Sir Abe Abricam Tinga. |
| 31:33 | Abricam Tinga | Yes, Paul, thank you. |
| 31:35 | Doc Nah | I'm good. I'm good now. All right. I'm good now. Thank you so much, everybody, and good luck to your next panelists. |
| 31:37 | Abricam Tinga | Thank you, thank you. |
| 31:44 | SAMSON, Johann Nathan | Thank you, Paul. |
| 31:44 | Abricam Tinga | Okay, thank you, Doc. Have a nice day. |
| 31:45 | Doc Nah | Okay, thank you everyone. Okay, bye bye. |
| 31:46 | Leonardo, Ely May | Take your dog. |
| 31:47 | Derek John E. Bantad | Thank you, Paula. |
| 31:47 | De Gracia, Maria Isabel | Thank you for… |
| 31:50 | Abricam Tinga | Guys, provide me the recording for this meeting and a summary of the transcript of the comments. No, kanina. OK. Going, you know, I got no now. OK. So, and then… |
| 31:59 | SAMSON, Johann Nathan | Pablo. |
| 32:02 | Derek John E. Bantad | Yes, Paul. I see. |
| 32:02 | SAMSON, Johann Nathan | The Pablo. |
| 32:03 | Leonardo, Ely May | Sorry, I'm sorry. |
| 32:05 | Abricam Tinga | Yes. |
| 32:07 | Leonardo, Ely May | Just to clarify, comments from our first redefense are from here, Paul. |
| 32:12 | Leonardo, Ely May | I sorry, first defense are here. |
| 32:13 | Abricam Tinga | Abigail Sean. Combination on your original, OKOK. Thank you, OK. |
| 32:16 | Leonardo, Ely May | Five. Okay. |
| 32:20 | SAMSON, Johann Nathan | Play book. |
| 32:22 | Leonardo, Ely May | Thank you, San. |
| 32:22 | Derek John E. Bantad | Thank you, sir. |
| 32:23 | Abricam Tinga | RAINE. |
| 32:23 | De Gracia, Maria Isabel | Thank you, sir. |
| 32:24 | SAMSON, Johann Nathan | Thank you. |
| 32:27 | Derek John E. Bantad | My name is Kailan Pablo. |
| 32:29 | SAMSON, Johann Nathan | Wait, wait, wait, wait, record. |
| 32:32 | Leonardo, Ely May | I'm sorry, sorry. |
| 32:36 | SAMSON, Johann Nathan | Leave it. |

---

*Source: auto-generated meeting transcript (cleaned for table structure; some ASR fragments left as spoken/captured).*
