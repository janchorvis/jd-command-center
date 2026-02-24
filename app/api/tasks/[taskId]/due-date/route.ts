import { NextRequest, NextResponse } from 'next/server';
import { updateDueDate } from '@/lib/asana';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { dueDate } = await request.json();
    await updateDueDate(taskId, dueDate);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating due date:', error);
    return NextResponse.json(
      { error: 'Failed to update due date' },
      { status: 500 }
    );
  }
}
