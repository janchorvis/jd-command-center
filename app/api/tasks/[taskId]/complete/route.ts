import { NextRequest, NextResponse } from 'next/server';
import { completeTask } from '@/lib/asana';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    await completeTask(taskId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error completing task:', error);
    return NextResponse.json(
      { error: 'Failed to complete task' },
      { status: 500 }
    );
  }
}
