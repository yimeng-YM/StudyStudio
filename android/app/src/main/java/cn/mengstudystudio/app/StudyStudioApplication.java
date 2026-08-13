package cn.mengstudystudio.app;

import android.app.Application;

public final class StudyStudioApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        LocalSearchGateway.ensureStarted(this);
    }
}
