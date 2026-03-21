import * as readTools from './tools/readTools';
import * as writeTools from './tools/writeTools';
import { ToolCall } from '@/services/ai';

/**
 * 集中注册和管理 AI 可调用的所有前端本地工具。
 * 将声明的函数名称与实际执行的方法实现（分别来自 readTools 和 writeTools）进行映射。
 */
export const ToolRegistry = {
  get_subjects: readTools.get_subjects,
  get_subject_details: readTools.get_subject_details,
  get_entity_content: readTools.get_entity_content,
  
  create_subject: writeTools.create_subject,
  update_subject: writeTools.update_subject,
  create_mindmap: writeTools.create_mindmap,
  update_mindmap: writeTools.update_mindmap,
  add_mindmap_elements: writeTools.add_mindmap_elements,
  create_note: writeTools.create_note,
  update_note: writeTools.update_note,
  create_quiz: writeTools.create_quiz,
  update_quiz: writeTools.update_quiz,
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

### Core Principle: Generate Rich, Complete Content
When using any creation tool, always generate as much content as possible:
- Do not stop after only a few examples.
- More is better; users can always refine or delete extra content.
- Prioritize both quality and quantity.

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
      description: `Update existing note content.
Modify the title or update the content.`,
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
      description: `Update an existing quiz bank.
Modify the title or update question content.
Maintain a substantial number of questions when updating.`,
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
