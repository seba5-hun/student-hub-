import { Star, BookOpen, Target, Heart, Flame, List, Calendar, Sparkles, Music, Dumbbell, Brain, Coffee } from 'lucide-react';

// Icons the custom sections can use (names stored in the data).
export const SECTION_ICON_MAP = { star: Star, book: BookOpen, target: Target, heart: Heart, flame: Flame, list: List, calendar: Calendar, sparkles: Sparkles, music: Music, dumbbell: Dumbbell, brain: Brain, coffee: Coffee };
export const sectionIcon = (name: string) => SECTION_ICON_MAP[name as keyof typeof SECTION_ICON_MAP] || Star;
