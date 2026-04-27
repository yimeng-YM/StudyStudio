import * as readTools from './tools/readTools';
import * as writeTools from './tools/writeTools';
import { ToolCall } from '@/services/ai';

/**
 * 集中注册和管理 AI 可调用的所有前端本地工具。
 * 将声明的函数名称与实际执行的方法实现（分别来自 readTools 和 writeTools）进行映射。
 */
export const ToolRegistry = {
  // 读取工具
  get_subjects: readTools.get_subjects,
  get_subject_details: readTools.get_subject_details,
  get_entity_content: readTools.get_entity_content,
  get_note_lines: readTools.get_note_lines,
  get_quiz_questions: readTools.get_quiz_questions,

  // 写入工具
  create_subject: writeTools.create_subject,
  update_subject: writeTools.update_subject,
  create_mindmap: writeTools.create_mindmap,
  update_mindmap: writeTools.update_mindmap,
  add_mindmap_elements: writeTools.add_mindmap_elements,
  clear_mindmap: writeTools.clear_mindmap,
  create_note: writeTools.create_note,
  update_note: writeTools.update_note,
  patch_note_content: writeTools.patch_note_content,
  create_quiz: writeTools.create_quiz,
  update_quiz: writeTools.update_quiz,
  patch_quiz_questions: writeTools.patch_quiz_questions,
  create_taskboard: writeTools.create_taskboard,
  update_taskboard: writeTools.update_taskboard,

  // 流程控制工具，用于在对话中辅助 AI 管理任务流状态
  present_plan: async (_args: { plan_summary: string }) => ({ status: 'success', message: 'Plan presented to user, awaiting confirmation.' }),
  start_execution: async () => ({ status: 'success', message: 'Execution started.' }),
};

/**
 * 统一的工具调用执行器。
 * 接收 AI 生成的结构化工具调用请求，解析参数并路由到对应的本地实现函数。
 * 
 * @param toolCall - 包含函数名称和序列化 JSON 参数的工具调用对象
 * @returns 对应工具函数执行后的返回结果（通常会再转为字符串喂给 AI 形成闭环）
 * @throws 当请求了未在 ToolRegistry 中注册的工具时抛出异常
 */
export async function executeTool(toolCall: ToolCall): Promise<any> {
  const toolName = toolCall.function.name;
  const toolArgs = JSON.parse(toolCall.function.arguments);
  
  const tool = (ToolRegistry as any)[toolName];
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  
  return await tool(toolArgs);
}

/**
 * 工具使用的最佳实践指南（注入给大模型的提示词片段）。
 * 明确了各个核心内容生成工具在实际调用时应遵循的格式标准和质量下限，
 * 特别强调了内容的丰富度（如题型分布、导图层级、任务节点数量），防止大模型偷懒。
 */
export const TOOL_USAGE_GUIDE = `
## Tool Usage Best Practices

### Core Principle: Prefer Editing Over Creating
**Before creating new content, always check if relevant content already exists:**
1. Call get_subjects to find existing subjects.
2. Call get_subject_details to see existing notes, quizzes, and mindmaps.
3. If matching content exists, UPDATE or PATCH it instead of creating a duplicate.

Creating a new entity is only appropriate when:
- No related entity exists yet.
- The user explicitly asks to create a new, separate document.

### Targeted Editing — Use Patch Tools for Small Changes
For notes and quizzes, prefer surgical edits over full rewrites:

| Situation | Preferred Tool |
|---|---|
| Changing part of a note | patch_note_content |
| Fixing or adding a few questions | patch_quiz_questions |
| Rewriting the majority of a note | update_note |
| Regenerating most questions | update_quiz |

**Workflow for targeted note edits (exact search-replace, no line numbers):**
1. get_entity_content — read the note to get the exact current text.
2. patch_note_content — copy the exact text to change into "search", put new text in "replace".
   - "search" MUST be a verbatim copy (including all spaces and newlines).
   - If the text appears multiple times, include surrounding context to make it unique.
   - On "not found" error: re-read with get_entity_content and copy again carefully.

**Workflow for targeted quiz edits:**
1. get_quiz_questions — inspect the relevant questions by ID or index range.
2. patch_quiz_questions — add / update / delete only those questions.

### Mindmaps — Multiple Can Coexist
- Each call to create_mindmap always creates a new, independent mindmap entity.
- Multiple mindmaps can coexist under the same subject.
- To expand an existing mindmap: use add_mindmap_elements.
- To rebuild a mindmap from scratch: use clear_mindmap then update_mindmap (or add_mindmap_elements).
- To partially modify structure: use update_mindmap with the full desired content.

### Quiz Creation (create_quiz / update_quiz)
Requirements: Generate an extensive set of questions for each quiz bank.
Question Type Distribution:
- Single choice: 40% (4-5 options)
- Multiple choice: 20% (4-5 options)
- True/False: 15%
- Fill-in-the-blanks: 15%
- Short answer: 10%

Each question must include:
- Clear description (supports Markdown)
- Correct answer (index for choice, "true"/"false" for True/False)
- Detailed explanation

### Mindmap Creation (create_mindmap / update_mindmap)
Requirements: Create detailed mindmaps with many nodes.
Structure Recommendations:
- 3-5 levels of hierarchy
- Each branch should have multiple sub-nodes
- Node content should be specific and meaningful

### Note Creation (create_note / update_note)
Requirements: Write extensive and detailed notes.
Structure Recommendations:
- Overview/Introduction
- Core concepts (multiple)
- Detailed sectional content
- Analysis of key and difficult points
- Practical applications/case studies
- Summary and key takeaways

### Task Board Creation (create_taskboard / update_taskboard)
Requirements: Include a comprehensive list of task blocks. Each block should have multiple specific task items.
Structure:
- Breakdown the whole goal into 3-5 logical phases.
- Each phase is a "taskBlock" node.
- Each block MUST contain 5-10 items.
- **IMPORTANT**: Each item in "items" MUST be an object: { "id": string, "text": string, "completed": boolean }. NEVER use numbers or strings directly in the items array.
- Ensure logical flow and actionable descriptions.
`;

export const ToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_subjects',
      description: `Retrieve the list of all subjects in the system.
Use this tool to:
- See existing subjects
- Get subject IDs for subsequent operations
- Understand the user's subject structure

Returns: An array of subjects with id, name, description, etc.`,
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_subject_details',
      description: `Retrieve all entities (mindmaps, notes, quizzes, taskboards) for a specific subject.
Use this tool to:
- See what content exists under a subject
- Get entity IDs for detailed operations
- Understand the overall content structure of a subject

Parameters:
- subjectId: ID of the subject (required)

Returns: A list of all entities under the specified subject`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' }
        },
        required: ['subjectId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_entity_content',
      description: `Retrieve the detailed content of a specific entity (mindmap, note, quiz, or taskboard).
Use this tool to:
- View the details of specific content
- Retrieve entity content for editing or reference
- Understand the full information of an entity

Parameters:
- entityId: ID of the entity (required)

Returns: The complete content of the entity`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the entity' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_note_lines',
      description: `Read specific lines from a note without fetching the entire content.
Use this tool to:
- Preview a section before making targeted edits
- Check whether certain content already exists at a location
- Save tokens by only loading the portion you need

Parameters:
- entityId: ID of the note entity (required)
- start_line: First line to return, 1-indexed inclusive (required)
- end_line: Last line to return, 1-indexed inclusive (optional, defaults to end of file)

Returns: Selected lines with line-number prefixes, plus total_lines for the full document.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          start_line: { type: 'number', description: 'First line number to read (1-indexed)' },
          end_line: { type: 'number', description: 'Last line number to read (1-indexed, inclusive). Omit to read to the end.' }
        },
        required: ['entityId', 'start_line']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_quiz_questions',
      description: `Read specific questions from a quiz bank without fetching all questions.
Use this tool to:
- Inspect a particular set of questions before editing them
- Check for duplicate or outdated content
- Save tokens when the quiz bank is large

Parameters:
- entityId: ID of the quiz entity (required)
- question_ids: Array of question IDs to retrieve (optional)
- start_index: First question to return, 1-indexed inclusive (optional)
- end_index: Last question to return, 1-indexed inclusive (optional)

If none of question_ids / start_index / end_index is provided, all questions are returned.

Returns: Selected questions each annotated with their 1-based index in the full bank, plus total_questions.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the quiz entity' },
          question_ids: { type: 'array', items: { type: 'string' }, description: 'Specific question IDs to retrieve' },
          start_index: { type: 'number', description: 'First question index to return (1-indexed)' },
          end_index: { type: 'number', description: 'Last question index to return (1-indexed, inclusive)' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_subject',
      description: `Create a new subject.
Use this tool to:
- Create a subject container for a new study topic
- Organize related study materials

Parameters:
- name: Name of the subject (required)
- description: Description of the subject (optional)

Best Practice: After creating a subject, immediately create related content (mindmaps, notes, quizzes, etc.) for it.`,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name of the subject' },
          description: { type: 'string', description: 'Optional description for the subject' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_subject',
      description: `Update information for an existing subject.
Use this tool to:
- Change the subject name
- Update the subject description`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject to update' },
          name: { type: 'string', description: 'New name for the subject' },
          description: { type: 'string', description: 'New description for the subject' }
        },
        required: ['subjectId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_mindmap',
      description: `Create a new mindmap for a subject.

Important: Generate a detailed mindmap with many nodes for depth.

Node Structure Requirements:
- Root Node: Core concept of the topic
- Level 2 Nodes: Main branches
- Level 3+ Nodes: Sub-categories and specific details

Content Format:
{
  "nodes": [
    { "id": "node1", "type": "input", "data": { "label": "Root Node" }, "position": { "x": 0, "y": 0 } },
    { "id": "node2", "type": "default", "data": { "label": "Child Node Content" }, "position": { "x": 200, "y": 100 } }
  ],
  "edges": [
    { "id": "e1-2", "source": "node1", "target": "node2" }
  ]
}

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the mindmap (required)
- content: Object containing nodes and edges (required)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the mindmap' },
          content: { 
            type: 'object', 
            description: 'The mindmap content containing React Flow nodes and edges. Should be comprehensive with extensive nodes.',
            properties: {
              nodes: { type: 'array', items: { type: 'object' } },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_mindmap',
      description: `Update an existing mindmap.
You can modify the title or update the entire content structure.
Maintain a comprehensive node count when updating.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the mindmap entity' },
          title: { type: 'string', description: 'New title' },
          content: { 
            type: 'object', 
            description: 'The mindmap content containing React Flow nodes and edges.',
            properties: {
              nodes: { type: 'array', items: { type: 'object' } },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_mindmap_elements',
      description: `Add new nodes and edges to an existing mindmap without replacing the entire content.
Use this tool to:
- Expand content on an existing map
- Add new branches or nodes
- Increase content while maintaining the original structure`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the mindmap entity' },
          nodes: {
            type: 'array',
            description: 'Array of React Flow nodes to add.',
            items: { type: 'object' }
          },
          edges: {
            type: 'array',
            description: 'Array of React Flow edges to add.',
            items: { type: 'object' }
          }
        },
        required: ['entityId', 'nodes', 'edges']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_mindmap',
      description: `Remove all nodes and edges from an existing mindmap, leaving an empty canvas.
Use this tool when you want to completely rebuild a mindmap's structure from scratch
without deleting the entity itself (preserving its ID, title, and association with the subject).

After clearing, use update_mindmap or add_mindmap_elements to populate new content.

Parameters:
- entityId: ID of the mindmap entity to clear (required)`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the mindmap entity to clear' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: `Create a new knowledge note for a subject.

Important: Content must be detailed and extensive.

Content Structure Recommendations:
1. Overview/Introduction
2. Core concept explanations (multiple)
3. Detailed sectional content
4. Analysis of key and difficult points
5. Practical applications/case studies
6. Summary and key takeaways

Content Requirements:
- Use Markdown format
- Include heading hierarchy (#, ##, ###)
- Use lists, tables, and other formatting
- Include specific examples and explanations

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the note (required)
- content: Markdown content of the note (required, should be extensive)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the note' },
          content: { type: 'string', description: 'The markdown content of the note. MUST be a raw string, NOT an object. Must be comprehensive and detailed.' }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_note',
      description: `Completely replace an existing note's content or title.
Use this only when the changes affect the majority of the document.
For small or targeted edits, prefer patch_note_content (search-replace) instead.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          title: { type: 'string', description: 'New title' },
          content: { type: 'string', description: 'The markdown content of the note. MUST be a raw string, NOT an object.' }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_note_content',
      description: `Replace a specific piece of text inside a note using exact search-and-replace — no line numbers needed.

**Always use this instead of update_note** when only part of the note needs to change.

How it works:
- You provide the exact original text you want to replace (search).
- You provide the new text to put in its place (replace).
- The tool finds the exact text and replaces it. If the text is not found, it throws a clear error so you can re-read and try again.

Rules:
1. Read the note first with get_entity_content (or get_note_lines) to get the exact current text.
2. Copy the text you want to change VERBATIM into the search field — including all spaces, punctuation, and newlines.
3. The search text must be unique in the document. If it appears multiple times, include a few lines of surrounding context so it becomes unique.
4. Do NOT modify the search string — even one extra space will cause a "not found" error.

Parameters:
- entityId: ID of the note entity (required)
- search: The exact original text to find. Must be a verbatim copy from the current note content. (required)
- replace: The new text to put in place of the search text. (required)`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the note entity' },
          search: { type: 'string', description: 'Exact original text to find. Must be copied verbatim from the note — including all whitespace and newlines.' },
          replace: { type: 'string', description: 'New text to substitute in place of the search text.' }
        },
        required: ['entityId', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_quiz',
      description: `Create a new quiz bank for a subject.

Critical: The quiz bank must contain an extensive set of questions.

Question Type Distribution:
- single_choice: ~40% (4-5 options)
- multiple_choice: ~20% (4-5 options)
- true_false: ~15%
- fill_in_blank: ~15%
- short_answer: ~10%

Content Format:
{
  "questions": [
    {
      "id": "q1",
      "type": "single_choice",
      "text": "Question content (Markdown supported)",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "0",  // Index for choice (0-based)
      "explanation": "Detailed explanation..."
    },
    ...
  ]
}

Important Notes:
- answer field: Use index for choices, "true" or "false" for True/False.
- Every question must have an explanation.
- Content must be clear and accurate.
- Maintain a balance of difficulty levels.

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the quiz bank (required)
- content: Object containing a questions array (required, should be a large set of questions)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the quiz bank' },
          content: { 
            type: 'object', 
            description: 'Quiz content containing an array of questions. Should be a comprehensive set of questions.',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'true_false', 'short_answer', 'essay'] },
                    text: { type: 'string', description: 'The question text (supports Markdown)' },
                    options: { type: 'array', items: { type: 'string' }, description: 'Options for choice questions' },
                    answer: { type: 'string', description: 'Correct answer. Index for choices, "true"/"false" for true_false, or the actual answer string.' },
                    explanation: { type: 'string', description: 'Detailed explanation for the answer' }
                  },
                  required: ['id', 'type', 'text', 'answer']
                }
              }
            },
            required: ['questions']
          }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_quiz',
      description: `Completely replace an existing quiz bank's content or title.
Use this only when regenerating the majority of the questions.
For adding, fixing, or deleting a few questions, prefer patch_quiz_questions instead.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the quiz entity' },
          title: { type: 'string', description: 'New title' },
          content: {
            type: 'object',
            description: 'Quiz content containing an array of questions.',
            properties: {
              questions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'true_false', 'short_answer', 'essay'] },
                    text: { type: 'string', description: 'The question text' },
                    options: { type: 'array', items: { type: 'string' }, description: 'Options for choice questions' },
                    answer: { type: 'string', description: 'Correct answer. Index for choices, "true"/"false" for true_false, or the actual answer string.' },
                    explanation: { type: 'string', description: 'Explanation for the answer' }
                  },
                  required: ['id', 'type', 'text', 'answer']
                }
              }
            },
            required: ['questions']
          }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'patch_quiz_questions',
      description: `Add, update, or delete individual questions in an existing quiz bank without rewriting the entire bank.
Use this tool for targeted changes — fixing a wrong answer, adding a few new questions, removing outdated ones.

**Strongly preferred over update_quiz** whenever:
- Only a small number of questions need to change
- You want to append new questions to an existing bank
- You have already identified the target question IDs via get_quiz_questions

Each operation in the list specifies:
- type: "add" | "update" | "delete"
- question_id: required for "update" and "delete" — the id field of the target question
- question: required for "add" (full question object); for "update" only the fields to merge

Multiple operations can be batched in a single call.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the quiz entity' },
          operations: {
            type: 'array',
            description: 'List of add/update/delete operations to perform on questions.',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['add', 'update', 'delete'], description: 'Operation type' },
                question_id: { type: 'string', description: 'ID of the question to update or delete' },
                question: {
                  type: 'object',
                  description: 'For "add": complete question object. For "update": fields to merge into the existing question.',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['single_choice', 'multiple_choice', 'fill_in_blank', 'true_false', 'short_answer', 'essay'] },
                    text: { type: 'string' },
                    options: { type: 'array', items: { type: 'string' } },
                    answer: { type: 'string' },
                    explanation: { type: 'string' }
                  }
                }
              },
              required: ['type']
            }
          }
        },
        required: ['entityId', 'operations']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_taskboard',
      description: `Create a new taskboard for a subject.

Task Node Format (type MUST be "taskBlock"):
{
  "nodes": [
    { 
      "id": "block1", 
      "type": "taskBlock", 
      "data": { 
        "title": "Phase 1: Preparation",
        "items": [
          { "id": "t1", "text": "Install required tools", "completed": false },
          { "id": "t2", "text": "Set up workspace", "completed": false }
        ]
      }, 
      "position": { "x": 100, "y": 100 } 
    }
  ],
  "edges": []
}

Parameters:
- subjectId: ID of the subject (required)
- title: Title of the taskboard (required)
- content: Object containing nodes (type: "taskBlock") and edges (required, should include multiple blocks with many items)`,
      parameters: {
        type: 'object',
        properties: {
          subjectId: { type: 'string', description: 'The ID of the subject' },
          title: { type: 'string', description: 'Title of the taskboard' },
          content: { 
            type: 'object', 
            description: 'Taskboard content containing nodes (type: "taskBlock") and edges. Each node data.items MUST be an array of objects: {id, text, completed}.',
            properties: {
              nodes: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['taskBlock'] },
                    data: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              text: { type: 'string' },
                              completed: { type: 'boolean' }
                            },
                            required: ['id', 'text', 'completed']
                          }
                        }
                      },
                      required: ['title', 'items']
                    },
                    position: { type: 'object' }
                  },
                  required: ['id', 'type', 'data', 'position']
                }
              },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['subjectId', 'title', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_taskboard',
      description: `Update an existing taskboard.
Modify the title or update task nodes.
Maintain a substantial number of tasks when updating.`,
      parameters: {
        type: 'object',
        properties: {
          entityId: { type: 'string', description: 'The ID of the taskboard entity' },
          title: { type: 'string', description: 'New title' },
          content: { 
            type: 'object', 
            description: 'Taskboard content containing nodes (type: "taskBlock") and edges. Each node data.items MUST be an array of objects: {id, text, completed}.',
            properties: {
              nodes: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['taskBlock'] },
                    data: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              text: { type: 'string' },
                              completed: { type: 'boolean' }
                            },
                            required: ['id', 'text', 'completed']
                          }
                        }
                      },
                      required: ['title', 'items']
                    },
                    position: { type: 'object' }
                  },
                  required: ['id', 'type', 'data', 'position']
                }
              },
              edges: { type: 'array', items: { type: 'object' } }
            }
          }
        },
        required: ['entityId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'present_plan',
      description: `Use this tool when you have finished the planning phase and want to present the plan to the user for confirmation. 
This tool signals that you are waiting for user input before proceeding to call any data modification tools.`,
      parameters: {
        type: 'object',
        properties: {
          plan_summary: { type: 'string', description: 'A brief summary of what you plan to accomplish.' }
        },
        required: ['plan_summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'start_execution',
      description: `Use this tool ONLY after the user has confirmed your plan (e.g., when they say "Confirm", "OK", "Start"). 
This tool formally switches your internal mode from PLANNING to EXECUTION. 
Call this tool as the very first step of your execution phase.`,
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];
