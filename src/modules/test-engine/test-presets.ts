import { QuestionDifficulty } from '@prisma/client';

export type TestPresetSection = {
  key: string;
  title: string;
  count: number;
  durationMinutes?: number;
  subjectId?: string;
  topicIds?: string[];
  difficulty?: QuestionDifficulty;
  marksPerQuestion?: number;
  negativeMarksPerWrong?: number;
  questionIds?: string[];
};

export type TestPreset = {
  key: string;
  title: string;
  exam: string;
  description?: string;
  durationMinutes: number;
  marksPerQuestion: number;
  negativeMarksPerWrong: number;
  sections: TestPresetSection[];
};

export const DEFAULT_TEST_PRESETS: TestPreset[] = [
  {
    key: 'maha-gk-60',
    title: 'Maharashtra Competitive - General 60',
    exam: 'MPSC / Police Bharti / Talathi',
    description:
      'Balanced general paper with reasoning, quantitative aptitude, Marathi, and current affairs.',
    durationMinutes: 60,
    marksPerQuestion: 1,
    negativeMarksPerWrong: 0.25,
    sections: [
      {
        key: 'reasoning',
        title: 'Reasoning',
        count: 15,
      },
      {
        key: 'quantitative',
        title: 'Quantitative Aptitude',
        count: 15,
      },
      {
        key: 'marathi',
        title: 'Marathi Language',
        count: 15,
      },
      {
        key: 'general-awareness',
        title: 'General Awareness',
        count: 15,
      },
    ],
  },
  {
    key: 'banking-prelims-100',
    title: 'Banking Prelims - 100',
    exam: 'IBPS / SBI / RBI Assistant',
    description:
      'Sectional paper aligned with standard banking prelims pattern.',
    durationMinutes: 60,
    marksPerQuestion: 1,
    negativeMarksPerWrong: 0.25,
    sections: [
      {
        key: 'english',
        title: 'English',
        count: 30,
      },
      {
        key: 'reasoning',
        title: 'Reasoning',
        count: 35,
      },
      {
        key: 'quantitative',
        title: 'Quantitative Aptitude',
        count: 35,
      },
    ],
  },
  {
    key: 'ssc-cgl-tier1-100',
    title: 'SSC CGL Tier-I - 100',
    exam: 'SSC CGL / CHSL',
    description:
      'General intelligence, English, quantitative aptitude and general awareness.',
    durationMinutes: 60,
    marksPerQuestion: 2,
    negativeMarksPerWrong: 0.5,
    sections: [
      {
        key: 'general-intelligence',
        title: 'General Intelligence & Reasoning',
        count: 25,
      },
      {
        key: 'general-awareness',
        title: 'General Awareness',
        count: 25,
      },
      {
        key: 'quantitative',
        title: 'Quantitative Aptitude',
        count: 25,
      },
      {
        key: 'english',
        title: 'English Comprehension',
        count: 25,
      },
    ],
  },
];
