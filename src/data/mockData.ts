import { Nucleus, Participant, Activity, Cluster } from '../types';

export const mockClusters: Cluster[] = [
{
  id: 'calgary',
  name: 'Calgary',
  center: { lat: 51.05, lng: -114.07 },
  zoom: 11
},
{
  id: 'edmonton',
  name: 'Edmonton',
  center: { lat: 53.55, lng: -113.49 },
  zoom: 11
},
{
  id: 'foothills',
  name: 'Foothills',
  center: { lat: 50.72, lng: -114.0 },
  zoom: 11
},
{
  id: 'rockyview',
  name: 'Rockyview',
  center: { lat: 51.2, lng: -114.3 },
  zoom: 11
},
{
  id: 'central',
  name: 'Central',
  center: { lat: 52.27, lng: -113.81 },
  zoom: 10
},
{
  id: 'northern-gates',
  name: 'Northern Gates',
  center: { lat: 54.75, lng: -113.5 },
  zoom: 10
}];


export const mockNuclei: Nucleus[] = [
{
  id: 'martindale',
  clusterId: 'calgary',
  name: 'Martindale',
  location: { lat: 51.1, lng: -113.95 },
  activities: [],
  engagementCounts: {
    coordinating: 4,
    supporting: 12,
    participating: 18,
    aware: 35
  }
},
{
  id: 'acadia',
  clusterId: 'calgary',
  name: 'Acadia',
  location: { lat: 50.98, lng: -114.08 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 8,
    participating: 15,
    aware: 28
  }
},
{
  id: 'whitehorn',
  clusterId: 'calgary',
  name: 'Whitehorn',
  location: { lat: 51.12, lng: -113.98 },
  activities: [],
  engagementCounts: {
    coordinating: 5,
    supporting: 15,
    participating: 22,
    aware: 40
  }
},
{
  id: 'taradale',
  clusterId: 'calgary',
  name: 'Taradale',
  location: { lat: 51.08, lng: -113.97 },
  activities: [],
  engagementCounts: {
    coordinating: 5,
    supporting: 37,
    participating: 20,
    aware: 52
  }
},
{
  id: 'willow-park',
  clusterId: 'calgary',
  name: 'Willow Park',
  location: { lat: 50.97, lng: -114.05 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 6,
    participating: 12,
    aware: 25
  }
},
{
  id: 'coventry',
  clusterId: 'calgary',
  name: 'Coventry',
  location: { lat: 51.05, lng: -114.02 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 10,
    participating: 16,
    aware: 30
  }
},
{
  id: 'falconridge',
  clusterId: 'calgary',
  name: 'Falconridge',
  location: { lat: 51.08, lng: -113.95 },
  activities: [],
  engagementCounts: {
    coordinating: 4,
    supporting: 11,
    participating: 19,
    aware: 33
  }
},
{
  id: 'new-brighton',
  clusterId: 'calgary',
  name: 'New Brighton',
  location: { lat: 50.91, lng: -113.96 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 9,
    participating: 14,
    aware: 27
  }
},
{
  id: 'meadowlark-park',
  clusterId: 'calgary',
  name: 'Meadowlark Park',
  location: { lat: 51.02, lng: -114.15 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 7,
    participating: 13,
    aware: 24
  }
},
{
  id: 'copperfield',
  clusterId: 'calgary',
  name: 'Copperfield',
  location: { lat: 50.92, lng: -113.98 },
  activities: [],
  engagementCounts: {
    coordinating: 4,
    supporting: 13,
    participating: 21,
    aware: 38
  }
},
{
  id: 'mahogany',
  clusterId: 'calgary',
  name: 'Mahogany',
  location: { lat: 50.89, lng: -113.94 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 8,
    participating: 14,
    aware: 26
  }
},
{
  id: 'glenbrook',
  clusterId: 'calgary',
  name: 'Glenbrook',
  location: { lat: 51.03, lng: -114.12 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 6,
    participating: 11,
    aware: 22
  }
},
{
  id: 'millwoods',
  clusterId: 'edmonton',
  name: 'Millwoods',
  location: { lat: 53.46, lng: -113.47 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 8,
    participating: 12,
    aware: 25
  }
},
{
  id: 'castle-downs',
  clusterId: 'edmonton',
  name: 'Castle Downs',
  location: { lat: 53.6, lng: -113.52 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 6,
    participating: 10,
    aware: 20
  }
},
{
  id: 'bonnie-doon',
  clusterId: 'edmonton',
  name: 'Bonnie Doon',
  location: { lat: 53.52, lng: -113.45 },
  activities: [],
  engagementCounts: {
    coordinating: 4,
    supporting: 10,
    participating: 15,
    aware: 30
  }
},
{
  id: 'okotoks',
  clusterId: 'foothills',
  name: 'Okotoks',
  location: { lat: 50.73, lng: -113.98 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 7,
    participating: 14,
    aware: 22
  }
},
{
  id: 'high-river',
  clusterId: 'foothills',
  name: 'High River',
  location: { lat: 50.58, lng: -113.87 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 5,
    participating: 9,
    aware: 18
  }
},
{
  id: 'airdrie',
  clusterId: 'rockyview',
  name: 'Airdrie',
  location: { lat: 51.29, lng: -114.01 },
  activities: [],
  engagementCounts: {
    coordinating: 4,
    supporting: 9,
    participating: 13,
    aware: 28
  }
},
{
  id: 'cochrane',
  clusterId: 'rockyview',
  name: 'Cochrane',
  location: { lat: 51.19, lng: -114.47 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 6,
    participating: 11,
    aware: 24
  }
},
{
  id: 'red-deer',
  clusterId: 'central',
  name: 'Red Deer',
  location: { lat: 52.27, lng: -113.81 },
  activities: [],
  engagementCounts: {
    coordinating: 4,
    supporting: 10,
    participating: 15,
    aware: 30
  }
},
{
  id: 'lacombe',
  clusterId: 'central',
  name: 'Lacombe',
  location: { lat: 52.47, lng: -113.74 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 5,
    participating: 8,
    aware: 15
  }
},
{
  id: 'athabasca',
  clusterId: 'northern-gates',
  name: 'Athabasca',
  location: { lat: 54.72, lng: -113.29 },
  activities: [],
  engagementCounts: {
    coordinating: 2,
    supporting: 6,
    participating: 10,
    aware: 20
  }
},
{
  id: 'westlock',
  clusterId: 'northern-gates',
  name: 'Westlock',
  location: { lat: 54.15, lng: -113.87 },
  activities: [],
  engagementCounts: {
    coordinating: 3,
    supporting: 7,
    participating: 12,
    aware: 25
  }
}];


export const mockActivities: Activity[] = [
{
  id: 'act-1',
  nucleusId: 'taradale',
  name: "Children's Class - Taradale",
  type: 'children-class',
  schedule: 'Saturdays at 10:00 AM',
  participants: {
    teachers: ['p-1', 'p-2'],
    children: ['p-3', 'p-4', 'p-5', 'p-6'],
    parents: ['p-7', 'p-8', 'p-9'],
    other: []
  }
},
{
  id: 'act-2',
  nucleusId: 'taradale',
  name: 'Junior Youth Group - Taradale',
  type: 'junior-youth',
  schedule: 'Sundays at 2:00 PM',
  participants: {
    animators: ['p-1'],
    'junior youth': ['p-10', 'p-11', 'p-12', 'p-13', 'p-14'],
    parents: [],
    other: []
  }
},
{
  id: 'act-3',
  nucleusId: 'taradale',
  name: 'Study Circle - Book 1',
  type: 'study-circle',
  schedule: 'Wednesdays at 7:30 PM',
  participants: {
    tutor: ['p-2'],
    participants: [
    'p-15',
    'p-16',
    'p-17',
    'p-18',
    'p-19',
    'p-20',
    'p-21',
    'p-22',
    'p-23',
    'p-24']

  },
  currentBook: 'Book 1: Reflections on the Life of the Spirit'
},
{
  id: 'act-4',
  nucleusId: 'taradale',
  name: 'Devotional Gathering',
  type: 'devotional',
  schedule: 'Every other Friday at 7:00 PM',
  participants: {
    host: ['p-7'],
    attendees: ['p-1', 'p-8', 'p-25']
  }
},
{
  id: 'act-10',
  nucleusId: 'millwoods',
  name: 'Study Circle - Book 2',
  type: 'study-circle',
  schedule: 'Tuesdays at 7:00 PM',
  participants: {
    tutor: ['p-30'],
    participants: ['p-31', 'p-32', 'p-33']
  },
  currentBook: 'Book 2: Arising to Serve'
},
{
  id: 'act-11',
  nucleusId: 'millwoods',
  name: 'Devotional Gathering - Millwoods',
  type: 'devotional',
  schedule: 'Fridays at 7:30 PM',
  participants: {
    host: ['p-31'],
    attendees: ['p-30', 'p-32', 'p-34']
  }
},
{
  id: 'act-12',
  nucleusId: 'red-deer',
  name: "Children's Class - Red Deer",
  type: 'children-class',
  schedule: 'Saturdays at 11:00 AM',
  participants: {
    teachers: ['p-35'],
    children: ['p-36', 'p-37', 'p-38'],
    parents: ['p-39'],
    other: []
  }
},
{
  id: 'act-13',
  nucleusId: 'athabasca',
  name: 'Junior Youth Group - Athabasca',
  type: 'junior-youth',
  schedule: 'Sundays at 3:00 PM',
  participants: {
    animators: ['p-40'],
    'junior youth': ['p-41', 'p-42', 'p-43'],
    parents: ['p-44'],
    other: []
  }
},
{
  id: 'act-14',
  nucleusId: 'bonnie-doon',
  name: 'Study Circle - Book 1',
  type: 'study-circle',
  schedule: 'Thursdays at 6:30 PM',
  participants: {
    tutor: ['p-45'],
    participants: ['p-46', 'p-47']
  },
  currentBook: 'Book 1: Reflections on the Life of the Spirit'
}];


export const mockParticipants: Participant[] = [
{
  id: 'p-1',
  name: 'Sara Miller',
  nuclei: ['taradale'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  }],

  capacities: [
  "Can teach children's classes",
  'Can animate junior youth groups'],

  activities: [
  {
    activityId: 'act-1',
    activityName: "Children's Class - Taradale",
    nucleusId: 'taradale',
    role: 'teacher'
  },
  {
    activityId: 'act-2',
    activityName: 'Junior Youth Group - Taradale',
    nucleusId: 'taradale',
    role: 'animator'
  }]

},
{
  id: 'p-2',
  name: 'David Chen',
  nuclei: ['taradale'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  },
  { id: 'c-6', name: 'Book 6: Teaching the Cause', status: 'completed' }],

  capacities: ["Can teach children's classes", 'Can tutor study circles'],
  activities: [
  {
    activityId: 'act-1',
    activityName: "Children's Class - Taradale",
    nucleusId: 'taradale',
    role: 'teacher'
  },
  {
    activityId: 'act-3',
    activityName: 'Study Circle - Book 1',
    nucleusId: 'taradale',
    role: 'tutor'
  }]

},
{
  id: 'p-7',
  name: 'Elaine Lopez',
  nuclei: ['taradale', 'martindale'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  },
  {
    id: 'c-5',
    name: 'Book 5: Releasing the Powers of Junior Youth',
    status: 'in-progress'
  }],

  capacities: [
  'Can host a devotional',
  'Knows how to have a conversation with a youth about the institute process'],

  activities: [
  {
    activityId: 'act-1',
    activityName: "Children's Class - Taradale",
    nucleusId: 'taradale',
    role: 'parent'
  },
  {
    activityId: 'act-4',
    activityName: 'Devotional Gathering',
    nucleusId: 'taradale',
    role: 'host'
  }]

},
// Edmonton - Millwoods participants
{
  id: 'p-30',
  name: 'Amina Osei',
  nuclei: ['millwoods'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  },
  {
    id: 'c-5',
    name: 'Book 5: Releasing the Powers of Junior Youth',
    status: 'completed'
  },
  { id: 'c-6', name: 'Book 6: Teaching the Cause', status: 'completed' },
  {
    id: 'c-7',
    name: 'Book 7: Walking Together on a Path of Service',
    status: 'completed'
  }],

  capacities: [
  'Can tutor study circles',
  'Can animate junior youth groups',
  'Can facilitate a reflection gathering'],

  activities: [
  {
    activityId: 'act-10',
    activityName: 'Study Circle - Book 2',
    nucleusId: 'millwoods',
    role: 'tutor'
  },
  {
    activityId: 'act-11',
    activityName: 'Devotional Gathering - Millwoods',
    nucleusId: 'millwoods',
    role: 'attendee'
  }]

},
{
  id: 'p-31',
  name: 'James Whitehorse',
  nuclei: ['millwoods'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'in-progress' }],

  capacities: ['Can host a devotional'],
  activities: [
  {
    activityId: 'act-10',
    activityName: 'Study Circle - Book 2',
    nucleusId: 'millwoods',
    role: 'participant'
  },
  {
    activityId: 'act-11',
    activityName: 'Devotional Gathering - Millwoods',
    nucleusId: 'millwoods',
    role: 'host'
  }]

},
{
  id: 'p-32',
  name: 'Priya Sharma',
  nuclei: ['millwoods'],
  engagementLevel: 'participating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  }],

  capacities: [],
  activities: [
  {
    activityId: 'act-10',
    activityName: 'Study Circle - Book 2',
    nucleusId: 'millwoods',
    role: 'participant'
  },
  {
    activityId: 'act-11',
    activityName: 'Devotional Gathering - Millwoods',
    nucleusId: 'millwoods',
    role: 'attendee'
  }]

},
{
  id: 'p-33',
  name: 'Kevin Tran',
  nuclei: ['millwoods'],
  engagementLevel: 'participating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'in-progress'
  }],

  capacities: [],
  activities: [
  {
    activityId: 'act-10',
    activityName: 'Study Circle - Book 2',
    nucleusId: 'millwoods',
    role: 'participant'
  }]

},
{
  id: 'p-34',
  name: 'Fatima Al-Rashid',
  nuclei: ['millwoods'],
  engagementLevel: 'aware',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-11',
    activityName: 'Devotional Gathering - Millwoods',
    nucleusId: 'millwoods',
    role: 'attendee'
  }]

},
// Central - Red Deer participants
{
  id: 'p-35',
  name: 'Rachel Blackwood',
  nuclei: ['red-deer'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  }],

  capacities: ["Can teach children's classes"],
  activities: [
  {
    activityId: 'act-12',
    activityName: "Children's Class - Red Deer",
    nucleusId: 'red-deer',
    role: 'teacher'
  }]

},
{
  id: 'p-36',
  name: 'Lily Blackwood',
  nuclei: ['red-deer'],
  engagementLevel: 'participating',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-12',
    activityName: "Children's Class - Red Deer",
    nucleusId: 'red-deer',
    role: 'child'
  }]

},
{
  id: 'p-37',
  name: 'Noah Sinclair',
  nuclei: ['red-deer'],
  engagementLevel: 'participating',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-12',
    activityName: "Children's Class - Red Deer",
    nucleusId: 'red-deer',
    role: 'child'
  }]

},
{
  id: 'p-38',
  name: 'Emma Sinclair',
  nuclei: ['red-deer'],
  engagementLevel: 'participating',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-12',
    activityName: "Children's Class - Red Deer",
    nucleusId: 'red-deer',
    role: 'child'
  }]

},
{
  id: 'p-39',
  name: 'Tom Sinclair',
  nuclei: ['red-deer'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' }],

  capacities: ['Can host a devotional'],
  activities: [
  {
    activityId: 'act-12',
    activityName: "Children's Class - Red Deer",
    nucleusId: 'red-deer',
    role: 'parent'
  }]

},
// Northern Gates - Athabasca participants
{
  id: 'p-40',
  name: 'Maria Gonzalez',
  nuclei: ['athabasca'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-5',
    name: 'Book 5: Releasing the Powers of Junior Youth',
    status: 'completed'
  }],

  capacities: ['Can animate junior youth groups'],
  activities: [
  {
    activityId: 'act-13',
    activityName: 'Junior Youth Group - Athabasca',
    nucleusId: 'athabasca',
    role: 'animator'
  }]

},
{
  id: 'p-41',
  name: 'Tyler Running Elk',
  nuclei: ['athabasca'],
  engagementLevel: 'participating',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-13',
    activityName: 'Junior Youth Group - Athabasca',
    nucleusId: 'athabasca',
    role: 'junior youth'
  }]

},
{
  id: 'p-42',
  name: 'Sophie Cardinal',
  nuclei: ['athabasca'],
  engagementLevel: 'participating',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-13',
    activityName: 'Junior Youth Group - Athabasca',
    nucleusId: 'athabasca',
    role: 'junior youth'
  }]

},
{
  id: 'p-43',
  name: 'Ethan Morin',
  nuclei: ['athabasca'],
  engagementLevel: 'participating',
  courses: [],
  capacities: [],
  activities: [
  {
    activityId: 'act-13',
    activityName: 'Junior Youth Group - Athabasca',
    nucleusId: 'athabasca',
    role: 'junior youth'
  }]

},
{
  id: 'p-44',
  name: 'Linda Running Elk',
  nuclei: ['athabasca'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  }],

  capacities: [],
  activities: [
  {
    activityId: 'act-13',
    activityName: 'Junior Youth Group - Athabasca',
    nucleusId: 'athabasca',
    role: 'parent'
  }]

},
// Edmonton - Bonnie Doon participants
{
  id: 'p-45',
  name: 'Hassan Jafari',
  nuclei: ['bonnie-doon'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  },
  { id: 'c-6', name: 'Book 6: Teaching the Cause', status: 'completed' },
  {
    id: 'c-7',
    name: 'Book 7: Walking Together on a Path of Service',
    status: 'in-progress'
  }],

  capacities: ["Can teach children's classes", 'Can tutor study circles'],
  activities: [
  {
    activityId: 'act-14',
    activityName: 'Study Circle - Book 1',
    nucleusId: 'bonnie-doon',
    role: 'tutor'
  }]

},
{
  id: 'p-46',
  name: 'Chloe Nguyen',
  nuclei: ['bonnie-doon'],
  engagementLevel: 'participating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'in-progress'
  }],

  capacities: [],
  activities: [
  {
    activityId: 'act-14',
    activityName: 'Study Circle - Book 1',
    nucleusId: 'bonnie-doon',
    role: 'participant'
  }]

},
{
  id: 'p-47',
  name: 'Marcus Johnson',
  nuclei: ['bonnie-doon'],
  engagementLevel: 'participating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'in-progress'
  }],

  capacities: [],
  activities: [
  {
    activityId: 'act-14',
    activityName: 'Study Circle - Book 1',
    nucleusId: 'bonnie-doon',
    role: 'participant'
  }]

},
// Cross-nucleus individuals for network visualization
{
  id: 'p-50',
  name: 'Nadia Ahmadi',
  nuclei: ['taradale', 'whitehorn'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' }],

  capacities: ['Can host a devotional'],
  activities: []
},
{
  id: 'p-51',
  name: 'Robert Fung',
  nuclei: ['taradale', 'falconridge'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  { id: 'c-6', name: 'Book 6: Teaching the Cause', status: 'completed' }],

  capacities: ['Can tutor study circles'],
  activities: []
},
{
  id: 'p-52',
  name: 'Grace Okafor',
  nuclei: ['martindale', 'coventry'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  }],

  capacities: [],
  activities: []
},
{
  id: 'p-53',
  name: 'Ali Rezaei',
  nuclei: ['whitehorn', 'falconridge', 'new-brighton'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  },
  {
    id: 'c-5',
    name: 'Book 5: Releasing the Powers of Junior Youth',
    status: 'completed'
  }],

  capacities: [
  "Can teach children's classes",
  'Can animate junior youth groups'],

  activities: []
},
{
  id: 'p-54',
  name: 'Jennifer Park',
  nuclei: ['acadia', 'willow-park'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'in-progress' }],

  capacities: [],
  activities: []
},
{
  id: 'p-55',
  name: 'Daniel Mensah',
  nuclei: ['copperfield', 'mahogany', 'new-brighton'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-7',
    name: 'Book 7: Walking Together on a Path of Service',
    status: 'completed'
  }],

  capacities: [
  'Can tutor study circles',
  'Can facilitate a reflection gathering'],

  activities: []
},
{
  id: 'p-56',
  name: 'Samira Khalil',
  nuclei: ['glenbrook', 'meadowlark-park'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  }],

  capacities: ['Can host a devotional'],
  activities: []
},
{
  id: 'p-57',
  name: 'Michael Torres',
  nuclei: ['coventry', 'whitehorn', 'taradale'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' }],

  capacities: [],
  activities: []
},
{
  id: 'p-58',
  name: 'Priya Sharma',
  nuclei: ['acadia', 'martindale'],
  engagementLevel: 'coordinating',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' },
  {
    id: 'c-3',
    name: "Book 3: Teaching Children's Classes Grade 1",
    status: 'completed'
  }],

  capacities: ["Can teach children's classes"],
  activities: []
},
{
  id: 'p-59',
  name: 'Thomas Chen',
  nuclei: ['glenbrook', 'copperfield'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  },
  { id: 'c-2', name: 'Book 2: Arising to Serve', status: 'completed' }],

  capacities: [],
  activities: []
},
{
  id: 'p-60',
  name: 'Fatima Al-Hassan',
  nuclei: ['willow-park', 'mahogany'],
  engagementLevel: 'supporting',
  courses: [
  {
    id: 'c-1',
    name: 'Book 1: Reflections on the Life of the Spirit',
    status: 'completed'
  }],

  capacities: ['Can host a devotional'],
  activities: []
}];